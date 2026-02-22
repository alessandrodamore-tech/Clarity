import { supabase } from './supabase'
import { USER_CONTEXT_KEY, GEMINI_MODEL, DAY_SUMMARIES_CACHE_KEY } from './constants'

const DIRECT_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const DIRECT_API_URL = DIRECT_API_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${DIRECT_API_KEY}`
  : null
const PROXY_URL = '/api/gemini'

// ─── USER CONTEXT (profile instructions) ─────────────────
function getUserContext() {
  try {
    const ctx = localStorage.getItem(USER_CONTEXT_KEY)
    return ctx && ctx.trim() ? ctx.trim() : null
  } catch { return null }
}

// Attempt to repair truncated/malformed JSON
function repairJSON(str) {
  // Fix missing values: "key":] or "key":} or "key":,
  let s = str.replace(/":\s*([,\]\}])/g, '":""$1')
  // Remove trailing incomplete key-value pairs
  s = s.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '')
  // Remove trailing comma
  s = s.replace(/,\s*$/, '')
  // Count open/close brackets
  const opens = { '{': 0, '[': 0 }
  let inString = false, escape = false
  for (const ch of s) {
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') opens['{']++
    if (ch === '}') opens['{']--
    if (ch === '[') opens['[']++
    if (ch === ']') opens['[']--
  }
  // Close any unterminated string
  if (inString) s += '"'
  // Close open brackets
  for (let i = 0; i < opens['[']; i++) s += ']'
  for (let i = 0; i < opens['{']; i++) s += '}'
  return s
}

function hashEntries(entries) {
  return entries.map(e => `${e.id}:${e.text?.slice(0, 50)}`).sort().join('|')
}

// ─── CACHE HELPERS (localStorage + Supabase) ─────────────
function loadCache() {
  try { return JSON.parse(localStorage.getItem(DAY_SUMMARIES_CACHE_KEY) || '{}') } catch { return {} }
}
function saveToCache(dateKey, data) {
  const cache = loadCache()
  cache[dateKey] = data
  try { localStorage.setItem(DAY_SUMMARIES_CACHE_KEY, JSON.stringify(cache)) } catch {}
}

// Save to Supabase (fire-and-forget)
async function saveToSupabase(userId, dateKey, data) {
  if (!userId) return
  try {
    await supabase.from('day_analyses').upsert({
      user_id: userId,
      entry_date: dateKey,
      summary: data.summary || '',
      insight: data.insight || null,
      substances: data.substances || [],
      entries_hash: data.entriesHash || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,entry_date' })
  } catch (e) {
    console.warn('Failed to save analysis to Supabase:', e)
  }
}

// Load from Supabase (merges with localStorage, Supabase wins)
export async function loadCachedSummaries(userId) {
  const local = loadCache()
  if (!userId) return local

  try {
    const { data, error } = await supabase
      .from('day_analyses')
      .select('entry_date, summary, insight, substances, entries_hash')
      .eq('user_id', userId)

    if (error || !data) return local

    const merged = { ...local }
    for (const row of data) {
      const key = row.entry_date
      merged[key] = {
        summary: row.summary || '',
        insight: row.insight || null,
        insights: row.insight ? [row.insight] : [],
        substances: row.substances || [],
        entriesHash: row.entries_hash || null,
      }
    }
    // Update localStorage with merged data
    try { localStorage.setItem(DAY_SUMMARIES_CACHE_KEY, JSON.stringify(merged)) } catch {}
    return merged
  } catch {
    return local
  }
}

export async function clearSummaryCache(userId) {
  localStorage.removeItem(DAY_SUMMARIES_CACHE_KEY)
  if (userId) {
    try {
      await supabase.from('day_analyses').delete().eq('user_id', userId)
    } catch (e) {
      console.warn('Failed to clear Supabase cache:', e)
    }
  }
}

// ─── GEMINI CALL (with retry) ────────────────────────────
async function callGemini(prompt, { maxOutputTokens = 8192, temperature = 0.1, jsonMode = true, retries = 2 } = {}) {
  const useProxy = !DIRECT_API_KEY

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt))

    try {
      let res
      if (useProxy) {
        res = await fetch(PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, maxOutputTokens, temperature, jsonMode })
        })
      } else {
        const config = { temperature, maxOutputTokens }
        if (jsonMode) config.responseMimeType = 'application/json'
        res = await fetch(DIRECT_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: config
          })
        })
      }

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Gemini API ${res.status}`)
        console.warn(`Gemini ${res.status}, retry ${attempt + 1}/${retries}`)
        continue
      }

      if (!res.ok) {
        const errText = await res.text()
        console.error(`Gemini ${res.status}:`, errText.slice(0, 300))
        throw new Error(`Gemini API ${res.status}`)
      }

      const data = await res.json()
      const parts = data?.candidates?.[0]?.content?.parts || []
      // Thinking model (gemini-3.1-pro-preview) emits a thought part first (thought: true)
      // followed by the actual response part — always pick the non-thought text
      const responsePart = parts.find(p => p.text && !p.thought) ?? parts.find(p => p.text) ?? {}
      const text = responsePart.text || '{}'
      const finishReason = data?.candidates?.[0]?.finishReason
      // Strip markdown code fences, then extract the first JSON object/array
      const stripped = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const jsonStart = Math.min(
        ...[stripped.indexOf('{'), stripped.indexOf('[')].filter(i => i !== -1)
      )
      const clean = jsonStart > 0 ? stripped.slice(jsonStart) : stripped
      if (!jsonMode) return clean
      if (finishReason === 'MAX_TOKENS') {
        console.warn('Gemini response truncated (MAX_TOKENS) — attempting repair')
      }
      try {
        let parsed = JSON.parse(clean)
        if (Array.isArray(parsed)) parsed = parsed[0] || {}
        return parsed
      } catch {
        // Try to repair truncated JSON by closing open structures
        try {
          const repaired = repairJSON(clean)
          let parsed = JSON.parse(repaired)
          if (Array.isArray(parsed)) parsed = parsed[0] || {}
          return parsed
        } catch (repairErr) {
          console.error('JSON repair failed, raw response:', clean.slice(-200))
          // Last resort: try to extract partial valid JSON
          const lastBrace = clean.lastIndexOf('}')
          if (lastBrace > 0) {
            const trimmed = repairJSON(clean.slice(0, lastBrace + 1))
            try {
              let parsed = JSON.parse(trimmed)
              if (Array.isArray(parsed)) parsed = parsed[0] || {}
              return parsed
            } catch {}
          }
          throw repairErr
        }
      }
    } catch (e) {
      if (e.message?.includes('Failed to fetch') || e.message?.includes('API 429') || e.message?.includes('API 5')) {
        lastErr = e
        console.warn(`Gemini call failed (attempt ${attempt + 1}):`, e.message)
        continue
      }
      throw e
    }
  }
  throw lastErr
}

// ─── DAY ANALYSIS (single call: summary + insight + substances) ─
// previousDays: array of { date, summary, insights } from older→newer
export async function extractDayData(entries, userId, cachedData, previousDays) {
  const entryDate = entries[0]?.entry_date
  const currentHash = hashEntries(entries)

  if (cachedData && cachedData.entriesHash === currentHash) {
    return cachedData
  }

  const entriesText = entries.map(e => `[${e.entry_time || ''}] ${e.text}`).join('\n\n')

  const contextBlock = previousDays?.length
    ? `\nPREVIOUS DAYS (oldest→newest):\n${previousDays.map(d =>
        `[${d.date}] ${d.summary}${d.insights?.length ? '\n  → ' + d.insights.join('\n  → ') : ''}`
      ).join('\n\n')}\n`
    : ''

  const userContext = getUserContext()
  const userContextBlock = userContext
    ? `\nUSER CONTEXT (use this to better interpret entries):\n${userContext}\n`
    : ''

  const prompt = `Analyze this personal wellness journal day. Extract structured data for tracking.
${userContextBlock}
You MUST produce ALL THREE fields — never return null or empty strings.

1. **summary**: 1-2 sentence overview of the day. What happened, how the person felt, key events.

2. **insight**: 2-4 sentences of observations for long-term analysis. You MUST ALWAYS find something — even from a single short entry. Examples of what to note:
   - Mood/energy state and what might explain it
   - Cause-effect: "did X → felt Y"
   - Comparison with previous days if available
   - Behavioral patterns, routines kept or broken
   - Sleep quality, social interactions, productivity
   - If entries are brief, note THAT as a pattern ("giornata con poche annotazioni — potrebbe indicare bassa energia o giornata routinaria")
   NEVER say "no patterns found" or return null. There is ALWAYS something to observe.

3. **actions**: Meaningful things the person DID or TOOK. Only include things relevant to wellness tracking:
   - **Medications**: "ho preso Elvanse", "Sertralina 50mg", "la pastiglia della mattina", "la solita pillola"
   - **Supplements**: melatonina, vitamina D, magnesio, omega-3
   - **Caffeine**: caffè, coffee, espresso, tè, energy drink
   - **Other substances**: alcohol, cannabis, nicotine
   - **Exercise**: palestra, corsa, camminata, yoga, nuoto
   - **Wellness**: sauna, massaggio, meditazione, bagno caldo
   - **Social**: uscita con amici, chiamata, visita
   - **Therapy**: seduta, appuntamento psicologo/psichiatra
   DO NOT include routine activities like waking up, eating meals, studying, working — only things that impact wellness.
   Be exhaustive for the categories above — extract from explicit AND implicit mentions.

Write summary and insight in the SAME LANGUAGE as the entries.
${contextBlock}
TODAY (${entryDate}):
${entriesText}

Return JSON:
{
  "summary": "string (REQUIRED, never empty)",
  "insight": "string (REQUIRED, never empty, never null)",
  "actions": [{ "name": "string", "detail": "string|null", "time": "HH:MM|null", "type": "medication|supplement|caffeine|substance|exercise|wellness|social|therapy|other" }]
}`

  try {
    const result = await callGemini(prompt, { maxOutputTokens: 8192, temperature: 0.25 })

    let insight = result.insight || null
    if (!insight && Array.isArray(result.insights) && result.insights.length > 0) {
      insight = result.insights[0]
    }

    // Support both "actions" (new) and "substances" (legacy cache)
    const actions = Array.isArray(result.actions) ? result.actions : (Array.isArray(result.substances) ? result.substances : [])

    const validated = {
      summary: result.summary || '',
      insight,
      insights: insight ? [insight] : [],
      actions,
      substances: actions, // backward compat
      entriesHash: currentHash
    }

    if (entryDate) {
      saveToCache(entryDate, validated)
      saveToSupabase(userId, entryDate, validated)
    }
    return validated
  } catch (err) {
    console.error(`[extractDayData] Failed for ${entryDate}:`, err)
    return { summary: '', insight: null, insights: [], actions: [], substances: [], entriesHash: null }
  }
}

// ─── GLOBAL REPORT (cross-day clinical analysis) ─────────
export async function generateGlobalInsights(analyzedDays) {
  // analyzedDays: [{ date, summary, insight, substances/factors }]
  if (!analyzedDays || analyzedDays.length === 0) {
    throw new Error('No analyzed days provided')
  }

  const sorted = analyzedDays.sort((a, b) => a.date.localeCompare(b.date))

  // Build rich day text with action types and details
  const daysText = sorted
    .map(d => {
      const actions = d.substances || d.factors || []
      const actionsText = actions.length
        ? `\n  Actions: ${actions.map(a => {
            if (typeof a === 'string') return a
            const parts = [a.name]
            if (a.type) parts.push(`[${a.type}]`)
            if (a.detail) parts.push(`- ${a.detail}`)
            if (a.time) parts.push(`at ${a.time}`)
            return parts.join(' ')
          }).join('; ')}`
        : ''
      return `[${d.date}]\nSummary: ${d.summary}\nInsight: ${d.insight || 'none'}${actionsText}`
    })
    .join('\n\n')

  // Language detection from summaries
  const sampleText = sorted.slice(0, 5).map(d => d.summary).join(' ')

  const userContext = getUserContext()
  const userContextBlock = userContext
    ? `\nUSER CONTEXT (personal background, conditions, medications, and instructions on how to interpret data):\n${userContext}\n`
    : ''

  const prompt = `You are a clinical wellness analyst writing a comprehensive personal health & wellness report based on journal data.
${userContextBlock}
CRITICAL: Write the ENTIRE report in the SAME LANGUAGE as the day summaries below. Here is a sample of the language used: "${sampleText.slice(0, 200)}"

ANALYZED DAYS (${analyzedDays.length} days):
${daysText}

Write a thorough, clinical-style wellness report. Be specific — cite dates, names, quantities. This report should read like a document written by a personal health analyst, not a dashboard.

Return JSON with these 8 fields:

{
  "executive_summary": "4-6 sentence detailed assessment of the person's overall wellness trajectory, key patterns, and most important findings. Be specific and data-driven.",
  "mood_trend": "improving|stable|declining|fluctuating",
  "confirmed_observations": [
    {
      "title": "concise observation name",
      "detail": "2-4 sentences with specific dates and evidence. Explain the pattern clearly.",
      "impact": "positive|negative|neutral"
    }
  ],
  "hypotheses": [
    {
      "title": "hypothesis name",
      "detail": "what you suspect and why",
      "confidence_pct": 65,
      "evidence_for": "supporting evidence with dates",
      "evidence_against": "contradicting evidence or gaps",
      "test_suggestion": "how to confirm or disprove this"
    }
  ],
  "medication_substance_analysis": [
    {
      "name": "substance name",
      "type": "medication|supplement|caffeine|substance",
      "frequency": "how often taken (e.g., 'daily', '3x/week')",
      "observed_effects": "detailed effects observed across days (2-3 sentences)",
      "mood_impact": "positive|negative|neutral|mixed",
      "energy_impact": "positive|negative|neutral|mixed",
      "focus_impact": "positive|negative|neutral|mixed|unknown",
      "timing_notes": "when taken and how timing affects results",
      "interactions": "notable interactions with other substances or activities",
      "concerns": "any concerns or things to watch"
    }
  ],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "action": "specific actionable recommendation",
      "rationale": "why this matters, with data reference (dates, patterns)",
      "expected_impact": "what improvement to expect"
    }
  ],
  "ideal_routine": {
    "description": "1-2 sentence overview of what the ideal day looks like based on the data",
    "schedule": [
      {
        "time_block": "e.g., '7:00-8:00' or 'Morning'",
        "activity": "what to do",
        "rationale": "why, based on journal evidence"
      }
    ]
  },
  "experiments": [
    {
      "title": "experiment name",
      "description": "what to try and how",
      "duration": "e.g., '2 weeks'",
      "measure": "how to measure success",
      "hypothesis": "what you expect to happen"
    }
  ]
}

Rules:
- Every section must have at least 1 item (except ideal_routine.schedule which can be empty if insufficient data)
- confirmed_observations: things you are confident about from the data
- hypotheses: things that MIGHT be true but need more data — include confidence_pct (0-100)
- medication_substance_analysis: ONLY substances/medications actually mentioned in the data
- recommendations: ordered by priority (high first)
- experiments: concrete self-experiments the person could run to test hypotheses
- Be exhaustive and thorough — this is a clinical report, not a summary`

  return await callGemini(prompt, { maxOutputTokens: 8192, temperature: 0.25, retries: 2 })
}

// ─── SMART ALERTS (health intelligence from entries) ─────
export async function generateAlerts(entries, daySummaries) {
  if (!entries || entries.length === 0) {
    throw new Error('No entries provided')
  }

  // Use recent entries (last 14 days)
  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - 14)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const recentEntries = entries
    .filter(e => e.entry_date >= cutoffStr)
    .sort((a, b) => {
      if (a.entry_date !== b.entry_date) return a.entry_date.localeCompare(b.entry_date)
      return (a.entry_time || '').localeCompare(b.entry_time || '')
    })

  if (recentEntries.length === 0) {
    throw new Error('No recent entries found')
  }

  const entriesText = recentEntries
    .map(e => `[${e.entry_date} ${e.entry_time || ''}] ${e.text}`)
    .join('\n')

  // Add day summaries for context
  const summariesText = Object.entries(daySummaries || {})
    .filter(([date]) => date >= cutoffStr)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => `[${date}] ${d.summary || ''}`)
    .join('\n')

  // Language detection
  const sampleText = recentEntries.slice(0, 5).map(e => e.text).join(' ')

  const userContext = getUserContext()
  const userContextBlock = userContext
    ? `\nUSER CONTEXT (personal background, conditions, instructions):\n${userContext}\n`
    : ''

  const prompt = `You are a clinical health intelligence system analyzing personal journal entries to detect health-relevant signals, patterns, and insights. Your job is NOT to create to-do lists — it's to surface health intelligence that helps the user understand their wellbeing.
${userContextBlock}
CRITICAL: Write EVERYTHING in the SAME LANGUAGE as the entries below. Here is a sample: "${sampleText.slice(0, 200)}"

TODAY'S DATE: ${today.toISOString().slice(0, 10)}

RECENT ENTRIES (last 14 days):
${entriesText}

${summariesText ? `DAY SUMMARIES:\n${summariesText}` : ''}

Analyze ALL entries and generate health alerts. Each alert is a signal about the user's wellbeing. Types:

- **warning**: Declining trends, anomalies, concerning symptoms, missed medications, sleep disruption, worsening patterns. These are things the user should pay attention to.
- **medication**: Medication adherence observations, timing patterns, side effects, interactions, missed doses, effectiveness notes.
- **pattern**: Observed correlations — exercise→mood, caffeine→sleep, social→energy, time-of-day effects. Cross-factor insights with evidence.
- **positive**: Reinforcement of good trends, streaks, improvements, healthy habits being maintained. Celebrate what's working.
- **answer**: If the user wondered about something, asked themselves a question, or expressed uncertainty about health topics — provide a genuinely useful, detailed answer.

For EVERY alert:
- **text**: A clear 1-sentence headline of the signal
- **type**: warning|medication|pattern|positive|answer
- **severity**: high (needs attention now), medium (worth noting), low (informational)
- **detail**: 2-4 sentences explaining the signal with specific dates and evidence from entries
- **source_dates**: Array of relevant entry dates ["YYYY-MM-DD"]
- **source_excerpt**: Brief quote from an entry that illustrates this signal
- **search_query**: Only for type=answer — a Google search query for more info

DO NOT include:
- To-do items, tasks, things to buy/call/schedule
- Generic wellness advice not grounded in the user's data
- Anything that reads like a reminder or checklist item

DO include:
- Every health-relevant signal you can find in the data
- Specific dates, quantities, and evidence
- Cross-day patterns and correlations
- Both positive and concerning signals
- Medication tracking observations

Return JSON:
{
  "alerts": [
    {
      "text": "Headline of the alert (1 sentence)",
      "type": "warning|pattern|positive|answer|medication",
      "severity": "high|medium|low",
      "detail": "Extended explanation with dates and evidence (2-4 sentences)",
      "source_dates": ["YYYY-MM-DD"],
      "source_excerpt": "Quote from entry",
      "search_query": "Only for type=answer"
    }
  ]
}

Rules:
- Ground every alert in actual entry data — cite dates and quotes
- Severity: high = declining trends, missed critical meds, concerning symptoms; medium = notable patterns, minor concerns; low = informational, positive reinforcement
- Aim for 5-12 alerts covering different aspects of the user's health data
- Be thorough — scan EVERY entry for health signals
- DO NOT generate to-do items or task reminders`

  return await callGemini(prompt, { maxOutputTokens: 8192, temperature: 0.2, retries: 2 })
}

// ─── SMART PLACEHOLDER (context-aware input hints) ────────
export async function generatePlaceholderHints(recentEntries) {
  if (!recentEntries || recentEntries.length === 0) return null

  const now = new Date()
  const timeStr = now.toTimeString().slice(0, 5)

  const sorted = [...recentEntries].sort((a, b) => {
    const da = a.entry_date || ''; const db = b.entry_date || ''
    if (da !== db) return da.localeCompare(db)
    return (a.entry_time || '').localeCompare(b.entry_time || '')
  })
  const last5 = sorted
    .slice(-5)
    .map(e => `[${e.entry_date} ${e.entry_time || ''}] ${e.text}`)
    .join('\n')

  const userContext = getUserContext()
  const userContextBlock = userContext
    ? `\nUser context: ${userContext}\n`
    : ''

  const prompt = `You are a smart journaling assistant. Based on the user's recent entries and the current time of day, generate 6 SHORT prompts (max 55 chars each) to guide their next journal entry.

Mix these types:
- Questions about how they feel after something recent (medications, activities, events)
- Prompts to track something health-relevant (sleep quality, energy level, mood shift)
- Follow-ups on recent context (recurring patterns, goals, health observations)
- Time-relevant prompts (morning→sleep/energy, afternoon→focus/mood, evening→reflection/gratitude)

DO NOT suggest to-do items, tasks, or reminder-style prompts ("did you call X?", "remember to Y").

Rules:
- SAME LANGUAGE as the entries
- Each prompt must be DIFFERENT in topic and type
- Warm and casual, like a friend checking in
- Specific to their data — NOT generic ("How are you?", "How was your day?")
- Short enough to fit as input placeholder text
- For each hint, if it was inspired by a SPECIFIC entry, include that entry's date and time
${userContextBlock}
Current time: ${timeStr}

Recent entries:
${last5}

Return JSON: {"hints": [{"text": "prompt text", "source_date": "YYYY-MM-DD or null", "source_time": "HH:MM or null"}, ...]}`

  try {
    const result = await callGemini(prompt, { maxOutputTokens: 4096, temperature: 0.6, retries: 1 })
    const hints = result?.hints
    if (Array.isArray(hints) && hints.length > 0) {
      // Normalize: support both object and string formats
      return hints.map(h => typeof h === 'string' ? { text: h } : h)
    }
    if (result?.hint) return [{ text: result.hint }]
    return null
  } catch (e) {
    console.warn('Failed to generate placeholder hints:', e)
    return null
  }
}

// ─── FIND MISSED ALERTS ──────────────────────────────────
export async function findMissedAlerts(entries, existingAlerts) {
  if (!entries?.length) throw new Error('No entries provided')

  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - 14)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const recentEntries = entries
    .filter(e => e.entry_date >= cutoffStr)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || (a.entry_time || '').localeCompare(b.entry_time || ''))

  if (!recentEntries.length) throw new Error('No recent entries')

  const entriesText = recentEntries
    .map(e => `[${e.entry_date} ${e.entry_time || ''}] ${e.text}`)
    .join('\n')

  const existingTexts = (existingAlerts || []).map(a => a.text).join('\n- ')

  const sampleText = recentEntries.slice(0, 5).map(e => e.text).join(' ')

  const userContext = getUserContext()
  const userContextBlock = userContext
    ? `\nUSER CONTEXT:\n${userContext}\n`
    : ''

  const prompt = `You are a meticulous health intelligence analyst. The user already has a list of health alerts extracted from their journal. They believe something is MISSING. Re-read every entry carefully and find health signals that were overlooked.
${userContextBlock}
CRITICAL: Write in the SAME LANGUAGE as the entries. Sample: "${sampleText.slice(0, 200)}"

TODAY: ${today.toISOString().slice(0, 10)}

ENTRIES (last 14 days):
${entriesText}

EXISTING ALERTS (do NOT repeat these):
${existingTexts ? `- ${existingTexts}` : '(none)'}

Find ONLY missed health signals. Look for:
- Mood or energy patterns not flagged
- Medication observations (timing, effects, missed doses)
- Correlations between activities and wellbeing
- Health concerns mentioned but not captured
- Questions about health the user asked themselves
- Positive trends worth reinforcing

DO NOT include to-do items, tasks, or things to buy/call/schedule.

Return JSON:
{
  "alerts": [
    {
      "text": "Headline (1 sentence)",
      "type": "warning|pattern|positive|answer|medication",
      "severity": "high|medium|low",
      "detail": "2-4 sentences with dates and evidence",
      "source_dates": ["YYYY-MM-DD"],
      "source_excerpt": "Quote from entry",
      "search_query": "Only for type=answer"
    }
  ]
}

Rules:
- NEVER repeat existing alerts
- Only include genuinely missed signals — empty [] is fine
- Ground every alert in actual entry data`

  return await callGemini(prompt, { maxOutputTokens: 8192, temperature: 0.2, retries: 1 })
}

// ─── VOICE CHAT → ANNOTATION ──────────────────────────────
// Prende la trascrizione della chat vocale e genera un'annotazione
// in prima persona, stile journal, pronta per essere salvata.
export async function generateAnnotationFromVoiceChat(conversation) {
  if (!conversation || conversation.length === 0) return null

  const userContext = getUserContext()
  const userContextBlock = userContext ? `\nUser context: ${userContext}\n` : ''

  const conversationText = conversation
    .map(m => `${m.role === 'user' ? 'Utente' : 'Clarity'}: ${m.content}`)
    .join('\n')

  const prompt = `Sei un assistente di journaling. Hai appena condotto questa conversazione vocale con l'utente:

${conversationText}
${userContextBlock}
Scrivi un'annotazione di diario in prima persona, esattamente come se fosse l'utente a scriverla nel suo journal personale.
Regole:
- Prima persona ("Ho preso...", "Mi sento...", "Sto...")
- Linguaggio naturale e scorrevole, NON burocratico
- Includi tutte le informazioni chiave condivise (farmaci, umore, energia, sintomi fisici, attività)
- 2-4 frasi, concise ma complete
- NON iniziare con "Oggi", "Questo pomeriggio", "In questo momento" — inizia direttamente col contenuto
- NON aggiungere interpretazioni o consigli — solo ciò che l'utente ha detto
- Stessa lingua dell'utente

Rispondi con SOLO il testo dell'annotazione, senza JSON, senza virgolette, senza prefissi.`

  try {
    const result = await callGemini(prompt, { maxOutputTokens: 512, temperature: 0.3, retries: 1, jsonMode: false })
    if (!result || typeof result !== 'string' || !result.trim()) return null
    // Strip any accidental JSON wrapper or quotes
    const text = result.trim().replace(/^["']|["']$/g, '').replace(/^\{.*?"annotation"\s*:\s*"(.+)"\s*\}$/s, '$1')
    return text || null
  } catch (e) {
    console.warn('Failed to generate annotation from voice chat:', e)
    return null
  }
}

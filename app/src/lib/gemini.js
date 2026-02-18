import { supabase } from './supabase'

const DIRECT_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const MODEL = 'gemini-3-pro-preview'
const DIRECT_API_URL = DIRECT_API_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${DIRECT_API_KEY}`
  : null
const PROXY_URL = '/api/gemini'

const CACHE_KEY = 'clarity_day_summaries'
const USER_CONTEXT_KEY = 'clarity_user_context'

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
  return entries.map(e => `${e.id}:${e.text?.slice(0, 50)}`).join('|')
}

// ─── CACHE HELPERS (localStorage + Supabase) ─────────────
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function saveToCache(dateKey, data) {
  const cache = loadCache()
  cache[dateKey] = data
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch {}
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
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)) } catch {}
    return merged
  } catch {
    return local
  }
}

export async function clearSummaryCache(userId) {
  localStorage.removeItem(CACHE_KEY)
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
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      const finishReason = data?.candidates?.[0]?.finishReason
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
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
    return { summary: '', insight: null, insights: [], substances: [], entriesHash: null }
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

// ─── SMART REMINDERS (extract actionable items from entries) ─
export async function generateReminders(entries, daySummaries) {
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

  const prompt = `You are a smart personal assistant analyzing journal entries to extract actionable items, answer questions, provide suggestions, and flag health alerts. You have deep knowledge and can provide genuinely useful, specific information.
${userContextBlock}
CRITICAL: Write EVERYTHING in the SAME LANGUAGE as the entries below. Here is a sample: "${sampleText.slice(0, 200)}"

TODAY'S DATE: ${today.toISOString().slice(0, 10)}

RECENT ENTRIES (last 14 days):
${entriesText}

${summariesText ? `DAY SUMMARIES:\n${summariesText}` : ''}

Analyze ALL entries carefully and extract:

1. **reminders**: Things the person mentioned needing to do, check, remember, buy, call, etc. Look for:
   - Explicit: "devo", "ricordarmi", "non dimenticare", "I need to", "I should", "domani devo", "controllare", "verificare", "comprare"
   - Implicit: mentioned plans, appointments, deadlines, things to research
   - Recurring: things they do regularly but might have forgotten recently
   For each reminder, if there's a concrete action the person can take (a search query, a link type, a specific step), include it in the "action_hint" field.

2. **answers**: If the person wrote about wondering something, wanting to look something up, or asking themselves a question ("mi chiedo se...", "devo controllare...", "non so se...", "vorrei sapere..."):
   - Provide a DETAILED, genuinely useful answer (3-5 sentences)
   - Use your knowledge to give real information, not generic platitudes
   - If the question is about health/medication, cite general medical knowledge
   - If it's about a practical topic, give concrete steps
   - Include a "search_query" field with a Google search query the person could use to learn more

3. **suggestions**: Proactive, data-driven tips. Be SPECIFIC:
   - Reference actual dates and entries ("On Feb 12 you felt great after...")
   - Quantify patterns ("3 out of 5 days with exercise showed better mood")
   - Give actionable next steps, not vague advice
   - Positive reinforcement for good patterns
   - Gentle nudges for gaps (missed medication, reduced activity)
   - Cross-factor correlations ("caffeine after 3pm correlates with poor sleep entries")

4. **alerts**: Health-related items requiring attention:
   - Medication gaps with specific counts ("haven't mentioned X in Y days")
   - Mood decline patterns with dates
   - Sleep issues mentioned repeatedly
   - Substance use patterns
   - Any pattern that might warrant professional attention

Return JSON:
{
  "reminders": [
    {
      "text": "what needs to be done",
      "source_date": "YYYY-MM-DD",
      "source_excerpt": "brief quote from the entry that triggered this",
      "priority": "high|medium|low",
      "action_hint": "optional: concrete next step, search query, or useful info to help complete this task"
    }
  ],
  "answers": [
    {
      "question": "what the person was wondering about",
      "answer": "detailed, genuinely useful answer (3-5 sentences with real information)",
      "source_date": "YYYY-MM-DD",
      "search_query": "optional Google search query for more info"
    }
  ],
  "suggestions": [
    {
      "text": "specific, data-driven suggestion referencing dates and patterns",
      "type": "positive|warning|info",
      "based_on": "evidence from the entries (cite dates)"
    }
  ],
  "alerts": [
    {
      "title": "alert title",
      "detail": "detailed explanation with specific dates and evidence",
      "severity": "high|medium|low"
    }
  ]
}

Rules:
- Only include REAL reminders found in the text — don't invent tasks
- For answers, provide GENUINELY useful information with real knowledge — no generic advice
- Suggestions must cite specific dates and data from entries
- Alerts should only flag genuinely concerning patterns
- Each section can be empty [] if nothing relevant is found — don't force items
- Be thorough — scan EVERY entry for potential reminders and questions
- action_hint and search_query should be practical and immediately useful`

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
- Reminders to track something useful (sleep quality, energy level, mood shift)
- Follow-ups on recent context (plans mentioned, recurring patterns, goals)
- Time-relevant prompts (morning→sleep/energy, afternoon→focus/mood, evening→reflection/gratitude)

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

// ─── PER-ENTRY AI ACTIONS ────────────────────────────────
export async function analyzeEntry(entry, actionType, question) {
  if (!entry?.text) throw new Error('No entry text provided')

  const userContext = getUserContext()
  const userContextBlock = userContext
    ? `\nUSER CONTEXT (personal background, conditions, instructions):\n${userContext}\n`
    : ''

  const entryBlock = `ENTRY (${entry.entry_date} ${entry.entry_time || ''}):\n${entry.text}`

  const prompts = {
    analyze: `You are a clinical wellness analyst. Analyze this journal entry in depth — emotional state, energy level, behaviors, cause-effect patterns, wellness signals. Write 3-5 paragraphs. Be specific, cite parts of the text.
${userContextBlock}
${entryBlock}

Respond in the SAME LANGUAGE as the entry text.`,

    ask: `You are a knowledgeable assistant. Answer the user's question in the context of their journal entry. Write 2-5 paragraphs. Cite relevant parts of the entry where useful. Be thorough and genuinely helpful.
${userContextBlock}
${entryBlock}

USER QUESTION: ${question || ''}

Respond in the SAME LANGUAGE as the question (or the entry if no clear language preference).`,
  }

  const prompt = prompts[actionType]
  if (!prompt) throw new Error(`Unknown action type: ${actionType}`)

  return await callGemini(prompt, { maxOutputTokens: 4096, temperature: 0.3, jsonMode: false, retries: 1 })
}

// ─── FIND MISSED REMINDERS ───────────────────────────────
export async function findMissedReminders(entries, existingData) {
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

  const existingReminders = (existingData?.reminders || []).map(r => r.text).join('\n- ')
  const existingSuggestions = (existingData?.suggestions || []).map(s => s.text).join('\n- ')
  const existingAlerts = (existingData?.alerts || []).map(a => a.title).join('\n- ')
  const existingAnswers = (existingData?.answers || []).map(a => a.question).join('\n- ')

  const sampleText = recentEntries.slice(0, 5).map(e => e.text).join(' ')

  const userContext = getUserContext()
  const userContextBlock = userContext
    ? `\nUSER CONTEXT:\n${userContext}\n`
    : ''

  const prompt = `You are a meticulous personal assistant. The user already has a list of reminders, suggestions, answers and alerts extracted from their journal. They believe something is MISSING. Your job is to carefully re-read every entry and find items that were overlooked.
${userContextBlock}
CRITICAL: Write in the SAME LANGUAGE as the entries. Sample: "${sampleText.slice(0, 200)}"

TODAY: ${today.toISOString().slice(0, 10)}

ENTRIES (last 14 days):
${entriesText}

ALREADY EXTRACTED (do NOT repeat these):
${existingReminders ? `Reminders:\n- ${existingReminders}` : 'Reminders: (none)'}
${existingSuggestions ? `Suggestions:\n- ${existingSuggestions}` : 'Suggestions: (none)'}
${existingAlerts ? `Alerts:\n- ${existingAlerts}` : 'Alerts: (none)'}
${existingAnswers ? `Answers:\n- ${existingAnswers}` : 'Answers: (none)'}

Find ONLY what's missing. Look very carefully for:
- Implicit tasks ("dovrei", "bisognerebbe", "sarebbe bene", "prima o poi")
- Mentioned appointments, deadlines, follow-ups that weren't captured
- Questions the user asked themselves that went unanswered
- Health patterns or concerns not flagged
- Practical suggestions the existing list missed

Return JSON with ONLY new items (empty [] sections are fine if nothing was missed):
{
  "reminders": [{ "text": "string", "source_date": "YYYY-MM-DD", "source_excerpt": "brief quote", "priority": "high|medium|low", "action_hint": "optional" }],
  "answers": [{ "question": "string", "answer": "detailed answer", "source_date": "YYYY-MM-DD", "search_query": "optional" }],
  "suggestions": [{ "text": "string", "type": "positive|warning|info", "based_on": "evidence" }],
  "alerts": [{ "title": "string", "detail": "string", "severity": "high|medium|low" }]
}

Rules:
- NEVER repeat items already in the existing list
- Only include genuinely missed items — if nothing was missed, return all empty arrays
- Be thorough: re-read every single entry word by word`

  return await callGemini(prompt, { maxOutputTokens: 8192, temperature: 0.2, retries: 1 })
}

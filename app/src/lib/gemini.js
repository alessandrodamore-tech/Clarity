import { supabase } from './supabase'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const MODEL = 'gemini-2.0-flash'
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`

const CACHE_KEY = 'clarity_day_summaries'

// Attempt to repair truncated JSON by closing open brackets/braces/strings
function repairJSON(str) {
  // Remove trailing incomplete key-value pairs
  let s = str.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '')
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
  const config = { temperature, maxOutputTokens }
  if (jsonMode) config.responseMimeType = 'application/json'

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt))

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: config
        })
      })

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
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      try {
        let parsed = JSON.parse(clean)
        if (Array.isArray(parsed)) parsed = parsed[0] || {}
        return parsed
      } catch {
        // Try to repair truncated JSON by closing open structures
        const repaired = repairJSON(clean)
        let parsed = JSON.parse(repaired)
        if (Array.isArray(parsed)) parsed = parsed[0] || {}
        return parsed
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

  const prompt = `Analyze this personal wellness journal day. Extract structured data for tracking.

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
    const result = await callGemini(prompt, { maxOutputTokens: 2048, temperature: 0.25 })

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

// ─── GLOBAL INSIGHTS (cross-day analysis) ────────────────
export async function generateGlobalInsights(analyzedDays) {
  // analyzedDays: [{ date, summary, insight, substances }]
  if (!analyzedDays || analyzedDays.length === 0) {
    throw new Error('No analyzed days provided')
  }

  const daysText = analyzedDays
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => {
      const substancesText = d.substances?.length
        ? `\n  Substances: ${d.substances.map(s => `${s.name}${s.dose ? ' ' + s.dose : ''}`).join(', ')}`
        : ''
      return `[${d.date}]\nSummary: ${d.summary}\nInsight: ${d.insight || 'none'}${substancesText}`
    })
    .join('\n\n')

  const prompt = `You are analyzing a personal wellness journal across multiple days. Your task is to identify patterns, correlations, and provide actionable insights.

ANALYZED DAYS (${analyzedDays.length} days):
${daysText}

Analyze the data and provide:

1. **Cross-day correlations** between substances (medications, supplements, caffeine) and outcomes (mood, energy, productivity). Look for patterns like:
   - Does a specific medication correlate with better/worse mood?
   - Does caffeine intake correlate with sleep quality or anxiety?
   - Are there temporal patterns (time of day effects)?

2. **Behavioral patterns**: How do activities (exercise, socializing, work, sleep) affect outcomes?
   - Exercise → mood/energy changes
   - Sleep quality → next-day performance
   - Social interactions → emotional state

3. **Medication effects over time**: Track any changes in medication and their observed effects on mood, energy, and overall wellbeing.

4. **Temporal patterns**: Day-of-week effects, time-of-day patterns, cumulative effects over consecutive days.

5. **Actionable recommendations**: Specific, evidence-based suggestions for improving wellbeing based on observed patterns.

Be specific and cite examples from the data. If you see a pattern, mention the dates where it occurred.

Return JSON:
{
  "summary": "3-5 sentence overall analysis of the person's wellness journey",
  "mood_trend": "improving"|"stable"|"declining"|"fluctuating",
  "patterns": [
    {
      "title": "concise pattern name",
      "description": "detailed explanation with specific examples and dates",
      "confidence": "high"|"medium"|"low"
    }
  ],
  "correlations": [
    {
      "factor": "what causes the effect (e.g., 'Morning Elvanse dose')",
      "effect": "observed outcome (e.g., 'increased focus until afternoon')",
      "direction": "positive"|"negative",
      "strength": "strong"|"moderate"|"weak",
      "evidence": "brief mention of specific dates or examples"
    }
  ],
  "substance_effects": [
    {
      "substance": "medication/supplement name",
      "observed_effects": "what you observed across days",
      "mood_impact": "positive"|"negative"|"neutral"|"mixed",
      "energy_impact": "positive"|"negative"|"neutral"|"mixed",
      "consistency": "consistent"|"variable",
      "notes": "any additional observations"
    }
  ],
  "behavioral_insights": [
    {
      "behavior": "activity or habit (e.g., 'Exercise', 'Early wake-up')",
      "impact": "observed effects on wellbeing",
      "frequency": "how often it occurred",
      "recommendation": "should they do more/less/maintain?"
    }
  ],
  "recommendations": [
    "specific, actionable recommendation based on the data"
  ]
}`

  return await callGemini(prompt, { maxOutputTokens: 4096, temperature: 0.3, retries: 1 })
}

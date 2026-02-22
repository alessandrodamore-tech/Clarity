export const TYPE_ICON = {
  medication: '💊', supplement: '🧬', caffeine: '☕', substance: '🍷',
  exercise: '🏋️', wellness: '🧖', social: '👥', therapy: '🧠', other: '•',
}
export const TYPE_COLORS = {
  medication: { bg: 'rgba(139,92,246,0.18)', solidBg: 'rgba(139,92,246,0.28)', border: 'rgba(139,92,246,0.35)', accent: '#7c3aed' },
  supplement: { bg: 'rgba(56,189,148,0.18)', solidBg: 'rgba(56,189,148,0.28)', border: 'rgba(56,189,148,0.35)', accent: '#0d9668' },
  caffeine:   { bg: 'rgba(180,130,60,0.18)',  solidBg: 'rgba(180,130,60,0.28)',  border: 'rgba(180,130,60,0.35)',  accent: '#92600a' },
  substance:  { bg: 'rgba(220,80,80,0.14)',   solidBg: 'rgba(220,80,80,0.22)',   border: 'rgba(220,80,80,0.28)',   accent: '#c04040' },
  exercise:   { bg: 'rgba(59,130,246,0.14)',   solidBg: 'rgba(59,130,246,0.22)',  border: 'rgba(59,130,246,0.28)',  accent: '#2563eb' },
  wellness:   { bg: 'rgba(168,85,247,0.14)',   solidBg: 'rgba(168,85,247,0.22)', border: 'rgba(168,85,247,0.28)', accent: '#7c3aed' },
  social:     { bg: 'rgba(251,146,60,0.14)',   solidBg: 'rgba(251,146,60,0.22)', border: 'rgba(251,146,60,0.28)', accent: '#ea580c' },
  therapy:    { bg: 'rgba(14,165,233,0.14)',   solidBg: 'rgba(14,165,233,0.22)', border: 'rgba(14,165,233,0.28)', accent: '#0284c7' },
  other:      { bg: 'rgba(150,150,170,0.14)', solidBg: 'rgba(150,150,170,0.22)', border: 'rgba(150,150,170,0.28)', accent: '#6b6b80' },
}
export const TYPE_ORDER = ['medication','supplement','caffeine','substance','exercise','wellness','social','therapy','other']
export const TYPE_LABELS = {
  medication: 'Medications', supplement: 'Supplements', caffeine: 'Caffeine', substance: 'Substances',
  exercise: 'Exercise', wellness: 'Wellness', social: 'Social', therapy: 'Therapy', other: 'Other',
}

// ─── LocalStorage Keys ───────────────────────────────────
export const USER_CONTEXT_KEY = 'clarity_user_context'
export const HINTS_CACHE_KEY = 'clarity_hints'
export const HINTS_TS_KEY = 'clarity_hints_ts'
export const OFFLINE_QUEUE_KEY = 'clarity_offline_queue'
export const INSIGHTS_CACHE_KEY = 'clarity_insights'
export const REPORTS_CACHE_KEY = 'clarity_global_report'
export const ALERTS_HASH_KEY = 'clarity_alerts_hash'
export const DAY_SUMMARIES_CACHE_KEY = 'clarity_day_summaries'
export const ONBOARDING_ANALYSIS_HINT_KEY = 'clarity_onboarding_analysis_hint_dismissed'

// ─── App Config ───────────────────────────────────────────
export const APP_VERSION = '0.8.0'
export const GEMINI_MODEL = 'gemini-3.1-pro-preview'
export const HINTS_STALE_MS = 4 * 60 * 60 * 1000  // 4 hours
export const GETSESSION_TIMEOUT_MS = 5000

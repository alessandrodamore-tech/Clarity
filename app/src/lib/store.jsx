import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import { autoSyncEntry, autoUpdateNotionEntry, getNotionCredentials, pullFromNotion, loadNotionCredentialsFromUser, loadNotionSyncMapFromUser } from './notion'

const AppContext = createContext(null)

// ─── STARTUP OPTIMIZATIONS ───────────────────────────────────────────────────

// Safety timeout for getSession() — on iPhone Safari with slow/no network,
// getSession() can hang indefinitely if it needs to refresh an expired token.
// After this many ms, we stop waiting and show the login screen.
const GETSESSION_TIMEOUT_MS = 5000

/**
 * Fast path: reads any stored Supabase session from localStorage instantly.
 * Returns the user regardless of token expiry — Supabase auto-refreshes tokens
 * on the first API call, so passing a slightly-expired user is safe.
 * Returns null only if there is no session at all (new user / logged out).
 */
function getStoredUser() {
  try {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
    if (!supabaseUrl) return null
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    const raw = localStorage.getItem(`sb-${projectRef}-auth-token`)
    if (!raw) return null
    const session = JSON.parse(raw)
    return session?.user ?? null
  } catch {}
  return null
}

// ─── APP PROVIDER ────────────────────────────────────────────────────────────

export function AppProvider({ children }) {
  // Fast path: if ANY session is stored, show content immediately (no loading screen).
  // Supabase auto-refreshes expired tokens on first API call — no flash of wrong content.
  const _initialUser = getStoredUser()
  const [user, setUser] = useState(_initialUser)
  const [loading, setLoading] = useState(!_initialUser)
  const [entries, setEntries] = useState([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [entriesError, setEntriesError] = useState(null)

  // Auth
  useEffect(() => {
    // Track whether loading has already been resolved (fast path or timeout)
    let loadingResolved = loading === false // true if fast path already resolved it

    // Safety timeout: if getSession() hangs (e.g., iPhone + slow network + token refresh),
    // stop showing "Loading..." and fall back to the login screen after 5 seconds.
    const timeoutId = setTimeout(() => {
      if (!loadingResolved) {
        loadingResolved = true
        console.warn('[Clarity] getSession() timed out after', GETSESSION_TIMEOUT_MS, 'ms — showing login')
        setUser(null)
        setLoading(false)
      }
    }, GETSESSION_TIMEOUT_MS)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeoutId)

      const sessionUser = session?.user ?? null

      // Always update user to the authoritative value from getSession()
      // (fast path may have been stale or slightly outdated)
      setUser(sessionUser)

      // Resolve loading if not already done (fast path or timeout)
      if (!loadingResolved) {
        loadingResolved = true
        setLoading(false)
      }

      if (sessionUser) {
        // Synchronous — just writes to localStorage from user_metadata, no network
        loadNotionCredentialsFromUser(sessionUser)
        loadNotionSyncMapFromUser(sessionUser)

        // Background: refresh user metadata (ai_context etc.) without blocking render
        // getUser() validates the JWT server-side and returns fresh metadata.
        // We defer it here so it never blocks the initial render.
        try {
          const { data } = await supabase.auth.getUser()
          if (data?.user) {
            setUser(data.user) // same user.id → fetchEntries won't re-run (depends on id only)
            loadNotionCredentialsFromUser(data.user)
            loadNotionSyncMapFromUser(data.user)
          }
        } catch {}
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch entries when user changes (with retry for Safari AbortError)
  const fetchEntries = useCallback(async () => {
    if (!user) { setEntries([]); return }
    setEntriesLoading(true)

    let data = null, error = null
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 400 * attempt))
      const res = await supabase
        .from('entries')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })
        .order('entry_time', { ascending: false })
      data = res.data; error = res.error
      if (!error || error.name !== 'AbortError') break
      console.warn(`[Clarity] fetchEntries attempt ${attempt + 1} aborted, retrying...`)
    }

    if (error) {
      console.error('[Clarity] fetchEntries error:', error)
      setEntriesError(error.message || JSON.stringify(error))
    } else if (data) {
      setEntriesError(null)
      setEntries(data.map(e => ({
        id: e.id,
        text: e.raw_text,
        created_at: `${e.entry_date}T${e.entry_time}`,
        entry_date: e.entry_date,
        entry_time: e.entry_time,
        source: e.source,
        mood: null,
        energy: null,
        tags: [],
      })))
    }
    setEntriesLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]) // depend only on user ID — metadata changes (setUser refresh) won't re-trigger

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const addEntry = async (entry) => {
    if (!user) return
    const { data, error } = await supabase
      .from('entries')
      .insert({
        user_id: user.id,
        raw_text: entry.text,
        entry_date: entry.date || new Date().toISOString().split('T')[0],
        entry_time: entry.time || new Date().toTimeString().slice(0, 5),
        source: 'manual',
      })
      .select()
      .single()
    
    if (!error && data) {
      const newEntry = {
        id: data.id,
        text: data.raw_text,
        created_at: `${data.entry_date}T${data.entry_time}`,
        entry_date: data.entry_date,
        entry_time: data.entry_time,
        source: data.source,
        mood: null,
        energy: null,
        tags: [],
      }
      setEntries(prev => [newEntry, ...prev])
      // Auto-sync to Notion (fire-and-forget)
      autoSyncEntry({ id: data.id, text: data.raw_text })
    }
    return { data, error }
  }

  const updateEntry = async (id, updates) => {
    const dbUpdates = {}
    if (updates.text !== undefined) dbUpdates.raw_text = updates.text
    if (updates.entry_date !== undefined) dbUpdates.entry_date = updates.entry_date
    if (updates.entry_time !== undefined) dbUpdates.entry_time = updates.entry_time
    dbUpdates.updated_at = new Date().toISOString()

    const { error } = await supabase
      .from('entries')
      .update(dbUpdates)
      .eq('id', id)
    
    if (!error) {
      setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
      // Auto-sync update to Notion (fire-and-forget)
      if (updates.text !== undefined) {
        autoUpdateNotionEntry({ id, text: updates.text })
      }
    }
    return { error }
  }

  const deleteEntry = async (id) => {
    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id)
    
    if (!error) {
      setEntries(prev => prev.filter(e => e.id !== id))
    }
    return { error }
  }

  // Auto-pull new entries from Notion on app load (once per session)
  const notionPulled = useRef(false)
  useEffect(() => {
    if (!user || entriesLoading || entries.length === 0 || notionPulled.current) return
    const { token, databaseId } = getNotionCredentials()
    if (!token || !databaseId) return
    notionPulled.current = true

    pullFromNotion(token, databaseId, entries).then(async (newEntries) => {
      for (const entry of newEntries) {
        const { data, error } = await supabase
          .from('entries')
          .insert({
            user_id: user.id,
            raw_text: entry.text,
            entry_date: entry.entry_date,
            entry_time: entry.entry_time,
            source: 'notion',
          })
          .select()
          .single()
        if (!error && data) {
          setEntries(prev => [...prev, {
            id: data.id,
            text: data.raw_text,
            created_at: `${data.entry_date}T${data.entry_time}`,
            entry_date: data.entry_date,
            entry_time: data.entry_time,
            source: data.source,
            mood: null, energy: null, tags: [],
          }])
        }
      }
    }).catch(() => { /* silent fail */ })
  }, [user, entriesLoading])

  // Insights cache — persisted in localStorage
  const [insightsData, setInsightsData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('clarity_insights') || 'null') } catch { return null }
  })
  const setInsightsDataPersisted = (data) => {
    setInsightsData(data)
    try { localStorage.setItem('clarity_insights', JSON.stringify(data)) } catch {}
  }

  return (
    <AppContext.Provider value={{ user, loading, entries, entriesLoading, entriesError, addEntry, updateEntry, deleteEntry, fetchEntries, setUser, insightsData, setInsightsData: setInsightsDataPersisted }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)

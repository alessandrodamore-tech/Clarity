import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import { autoSyncEntry, getNotionCredentials, pullFromNotion } from './notion'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState([])
  const [entriesLoading, setEntriesLoading] = useState(false)

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch entries when user changes
  const fetchEntries = useCallback(async () => {
    if (!user) { setEntries([]); return }
    setEntriesLoading(true)
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false })
      .order('entry_time', { ascending: false })
    
    if (!error && data) {
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
  }, [user])

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
    <AppContext.Provider value={{ user, loading, entries, entriesLoading, addEntry, updateEntry, deleteEntry, fetchEntries, setUser, insightsData, setInsightsData: setInsightsDataPersisted }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)

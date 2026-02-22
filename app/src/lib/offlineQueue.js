// Gestisce entry create offline, le persiste in localStorage e le sincronizza quando la rete torna

const QUEUE_KEY = 'clarity_offline_queue'

/**
 * Genera un tempId uuid-like senza dipendenze esterne.
 */
function generateTempId() {
  return 'tmp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

/**
 * Aggiunge una entry alla queue offline.
 * @param {{ text: string, entry_date: string, entry_time: string }} entry
 * @returns {string} tempId assegnato
 */
export function queueEntry(entry) {
  const queue = getOfflineQueue()
  const tempId = generateTempId()
  const item = {
    tempId,
    text: entry.text,
    entry_date: entry.entry_date || entry.date || new Date().toISOString().split('T')[0],
    entry_time: entry.entry_time || entry.time || new Date().toTimeString().slice(0, 5),
    queued_at: new Date().toISOString(),
  }
  queue.push(item)
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch (e) {
    console.warn('[Clarity] offlineQueue: impossibile salvare in localStorage', e)
  }
  console.log('[Clarity] offlineQueue: entry accodata con tempId', tempId)
  return tempId
}

/**
 * Legge la queue corrente da localStorage.
 * @returns {Array<{ tempId: string, text: string, entry_date: string, entry_time: string, queued_at: string }>}
 */
export function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    return JSON.parse(raw) || []
  } catch {
    return []
  }
}

/**
 * Rimuove una entry dalla queue dopo sync riuscito.
 * @param {string} tempId
 */
export function removeFromQueue(tempId) {
  const queue = getOfflineQueue().filter(item => item.tempId !== tempId)
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {}
}

/**
 * Svuota tutta la queue.
 */
export function clearQueue() {
  try {
    localStorage.removeItem(QUEUE_KEY)
  } catch {}
}

/**
 * Sincronizza la queue offline con Supabase.
 * Inserisce ogni entry pendente, rimuove quelle riuscite.
 * @param {string} userId
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ synced: number, failed: number, entries: Array }>}
 */
export async function syncOfflineQueue(userId, supabase) {
  const queue = getOfflineQueue()
  if (queue.length === 0) return { synced: 0, failed: 0, entries: [] }

  console.log(`[Clarity] offlineQueue: sincronizzazione di ${queue.length} entry pendenti...`)

  let synced = 0
  let failed = 0
  const syncedEntries = []

  for (const item of queue) {
    try {
      const { data, error } = await supabase
        .from('entries')
        .insert({
          user_id: userId,
          raw_text: item.text,
          entry_date: item.entry_date,
          entry_time: item.entry_time,
          source: 'manual',
        })
        .select()
        .single()

      if (error) {
        console.warn(`[Clarity] offlineQueue: sync fallita per tempId ${item.tempId}:`, error)
        failed++
      } else if (data) {
        removeFromQueue(item.tempId)
        synced++
        syncedEntries.push({
          id: data.id,
          text: data.raw_text,
          created_at: `${data.entry_date}T${data.entry_time}`,
          entry_date: data.entry_date,
          entry_time: data.entry_time,
          source: data.source,
          mood: null,
          energy: null,
          tags: [],
        })
      }
    } catch (err) {
      console.warn(`[Clarity] offlineQueue: eccezione per tempId ${item.tempId}:`, err)
      failed++
    }
  }

  console.log(`[Clarity] offlineQueue: sync completata — synced=${synced}, failed=${failed}`)
  return { synced, failed, entries: syncedEntries }
}

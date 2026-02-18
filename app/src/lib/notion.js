import { supabase } from './supabase'

const PROXY_URL = '/api/notion'
const SYNC_MAP_KEY = 'clarity_notion_sync_map'

// ─── CREDENTIALS (stored in Supabase user metadata) ─────
export function getNotionCredentials() {
  // Read from localStorage cache (populated on login/save)
  try {
    const cached = localStorage.getItem('clarity_notion_creds')
    if (cached) return JSON.parse(cached)
  } catch {}
  return { token: '', databaseId: '', databaseName: '', titleProperty: 'Annotazione' }
}

export async function saveNotionCredentials(token, databaseId, databaseName, titleProperty) {
  const creds = { token: token || '', databaseId: databaseId || '', databaseName: databaseName || '', titleProperty: titleProperty || 'Annotazione' }
  // Cache locally for immediate reads
  try { localStorage.setItem('clarity_notion_creds', JSON.stringify(creds)) } catch {}
  // Persist to Supabase user metadata
  await supabase.auth.updateUser({ data: { notion_creds: creds } })
}

export async function clearNotionCredentials() {
  try {
    localStorage.removeItem('clarity_notion_creds')
    localStorage.removeItem(SYNC_MAP_KEY)
  } catch {}
  await supabase.auth.updateUser({ data: { notion_creds: null } })
}

// Load credentials from Supabase user metadata into localStorage cache
export function loadNotionCredentialsFromUser(user) {
  const creds = user?.user_metadata?.notion_creds
  if (creds?.token && creds?.databaseId) {
    try { localStorage.setItem('clarity_notion_creds', JSON.stringify(creds)) } catch {}
    return creds
  }
  return null
}

// ─── SYNC MAP (clarity_id → notion_page_id) ─────────────
function loadSyncMap() {
  try { return JSON.parse(localStorage.getItem(SYNC_MAP_KEY) || '{}') } catch { return {} }
}

function saveSyncMap(map) {
  try { localStorage.setItem(SYNC_MAP_KEY, JSON.stringify(map)) } catch {}
}

// ─── PROXY CALL ──────────────────────────────────────────
async function callNotion(body) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.message || data.error || `Notion API error ${res.status}`)
  }
  return data
}

// ─── TEST CONNECTION ─────────────────────────────────────
export async function testNotionConnection(token, databaseId) {
  return await callNotion({ action: 'test', token, database_id: databaseId })
}

// ─── PUSH ENTRIES TO NOTION ──────────────────────────────
export async function pushToNotion(token, databaseId, entries, onProgress) {
  const syncMap = loadSyncMap()
  const { titleProperty } = getNotionCredentials()

  // Filter out entries already synced
  const toSync = entries.filter(e => !syncMap[e.id])

  if (toSync.length === 0) {
    return { pushed: 0, total: entries.length, alreadySynced: entries.length }
  }

  // Push in batches of 10 to avoid timeout
  const batchSize = 10
  let pushed = 0

  for (let i = 0; i < toSync.length; i += batchSize) {
    const batch = toSync.slice(i, i + batchSize)
    const result = await callNotion({
      action: 'push',
      token,
      database_id: databaseId,
      title_property: titleProperty,
      entries: batch,
    })

    for (const r of result.results) {
      if (r.ok && r.notion_page_id) {
        syncMap[r.entry_id] = r.notion_page_id
        pushed++
      }
    }

    saveSyncMap(syncMap)
    if (onProgress) onProgress(pushed, toSync.length)
  }

  return { pushed, total: toSync.length, alreadySynced: entries.length - toSync.length }
}

// ─── AUTO-SYNC SINGLE ENTRY (fire-and-forget) ───────────
export async function autoSyncEntry(entry) {
  try {
    const { token, databaseId, titleProperty } = getNotionCredentials()
    if (!token || !databaseId) return // not connected

    const syncMap = loadSyncMap()
    if (syncMap[entry.id]) return // already synced

    const result = await callNotion({
      action: 'push',
      token,
      database_id: databaseId,
      title_property: titleProperty,
      entries: [{ id: entry.id, text: entry.text }],
    })

    const r = result.results?.[0]
    if (r?.ok && r.notion_page_id) {
      syncMap[entry.id] = r.notion_page_id
      saveSyncMap(syncMap)
    }
  } catch {
    // Silent fail — auto-sync should never block the user
  }
}

// ─── CLEANUP NOTION DUPLICATES ───────────────────────────
export async function cleanupNotionDuplicates(token, databaseId, onProgress) {
  // 1. Fetch all pages
  let allPages = []
  let cursor = null
  let hasMore = true
  while (hasMore) {
    const result = await callNotion({ action: 'query', token, database_id: databaseId, cursor })
    allPages = allPages.concat(result.results || [])
    hasMore = result.has_more
    cursor = result.next_cursor
    if (hasMore) await new Promise(r => setTimeout(r, 350))
  }

  // 2. Group by text content — keep the oldest (earliest created_time)
  const groups = {}
  for (const page of allPages) {
    const props = page.properties || {}
    const titleProp = Object.values(props).find(p => p.type === 'title')
    const text = titleProp ? (titleProp.title || []).map(t => t.plain_text || '').join('').trim().toLowerCase() : ''
    if (!text) continue
    if (!groups[text]) groups[text] = []
    groups[text].push(page)
  }

  // 3. For each group, sort by created_time asc, archive all except the oldest
  const toArchive = []
  for (const pages of Object.values(groups)) {
    if (pages.length <= 1) continue
    pages.sort((a, b) => new Date(a.created_time) - new Date(b.created_time))
    // Keep first (oldest), archive the rest
    for (let i = 1; i < pages.length; i++) {
      toArchive.push(pages[i].id)
    }
  }

  // 4. Archive duplicates
  let archived = 0
  for (const pageId of toArchive) {
    if (archived > 0) await new Promise(r => setTimeout(r, 350))
    try {
      await callNotion({ action: 'archive', token, page_id: pageId })
      archived++
    } catch { /* skip failed */ }
    if (onProgress) onProgress(archived, toArchive.length)
  }

  return { total: allPages.length, duplicates: toArchive.length, archived }
}

// ─── PULL ENTRIES FROM NOTION ────────────────────────────
export async function pullFromNotion(token, databaseId, existingEntries) {
  const syncMap = loadSyncMap()
  const syncedNotionIds = new Set(Object.values(syncMap))
  // Build text→clarityId lookup for matching existing entries
  const textToId = {}
  for (const e of (existingEntries || [])) {
    const key = (e.text || '').trim().toLowerCase()
    if (key) textToId[key] = e.id
  }
  const existingTexts = new Set(Object.keys(textToId))

  let allPages = []
  let cursor = null
  let hasMore = true

  // Paginate through all pages
  while (hasMore) {
    const result = await callNotion({
      action: 'query',
      token,
      database_id: databaseId,
      cursor,
    })
    allPages = allPages.concat(result.results || [])
    hasMore = result.has_more
    cursor = result.next_cursor
    // Rate limit
    if (hasMore) await new Promise(r => setTimeout(r, 350))
  }

  // Filter pages not already in Clarity
  let syncMapDirty = false
  const newEntries = []
  for (const page of allPages) {
    // Check if we already synced this Notion page
    if (syncedNotionIds.has(page.id)) continue

    // Find the title property (whatever it's called)
    const props = page.properties || {}
    const titleProp = Object.values(props).find(p => p.type === 'title')
    const text = titleProp ? (titleProp.title || []).map(t => t.plain_text || '').join('') : ''

    if (!text.trim()) continue

    // Skip if same text already exists in Clarity or already seen in this pull
    const textKey = text.trim().toLowerCase()
    if (existingTexts.has(textKey)) {
      // Register in sync map so push knows this Clarity entry is already on Notion
      const clarityId = textToId[textKey]
      if (clarityId && !syncMap[clarityId]) {
        syncMap[clarityId] = page.id
        syncMapDirty = true
      }
      continue
    }
    existingTexts.add(textKey) // dedup within Notion results too

    // Use page.created_time for date and time
    const createdAt = new Date(page.created_time)
    const entryDate = createdAt.toISOString().slice(0, 10)
    const entryTime = createdAt.toTimeString().slice(0, 5)

    newEntries.push({
      text,
      entry_date: entryDate,
      entry_time: entryTime,
      notion_page_id: page.id,
    })
  }

  // Save sync map if we discovered existing matches
  if (syncMapDirty) saveSyncMap(syncMap)

  return newEntries
}

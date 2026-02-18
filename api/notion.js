const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

export default async function handler(req, res) {
  // CORS headers for the frontend
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, token, database_id, entries, cursor, page_id, properties } = req.body || {}

  if (!token) {
    return res.status(400).json({ error: 'Notion token is required' })
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  }

  try {
    switch (action) {
      // Test connection and get database info
      case 'test': {
        if (!database_id) return res.status(400).json({ error: 'database_id is required' })
        const response = await fetch(`${NOTION_API}/databases/${database_id}`, { headers })
        const data = await response.json()
        if (!response.ok) return res.status(response.status).json(data)
        // Find the title property name (e.g. "Annotazione", "Name", "Title")
        const titleEntry = Object.entries(data.properties || {}).find(([, v]) => v.type === 'title')
        return res.status(200).json({
          ok: true,
          title: data.title?.[0]?.plain_text || 'Untitled',
          title_property: titleEntry?.[0] || 'Title',
          properties: Object.keys(data.properties || {}),
        })
      }

      // Query all pages from a database (with optional cursor for pagination)
      case 'query': {
        if (!database_id) return res.status(400).json({ error: 'database_id is required' })
        const body = {
          page_size: 100,
          sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        }
        if (cursor) body.start_cursor = cursor
        const response = await fetch(`${NOTION_API}/databases/${database_id}/query`, {
          method: 'POST', headers, body: JSON.stringify(body),
        })
        const data = await response.json()
        if (!response.ok) return res.status(response.status).json(data)
        return res.status(200).json({
          results: data.results || [],
          has_more: data.has_more || false,
          next_cursor: data.next_cursor || null,
        })
      }

      // Push entries from Clarity to Notion
      case 'push': {
        if (!database_id || !entries?.length) {
          return res.status(400).json({ error: 'database_id and entries are required' })
        }
        // Title property name from frontend (detected during test connection)
        const titleProp = req.body.title_property || 'Annotazione'
        const results = []
        for (const entry of entries) {
          // Rate limit: ~3 req/s
          if (results.length > 0) await new Promise(r => setTimeout(r, 350))

          const pageProps = {
            [titleProp]: {
              title: splitRichText(entry.text || ''),
            },
          }

          const response = await fetch(`${NOTION_API}/pages`, {
            method: 'POST', headers,
            body: JSON.stringify({
              parent: { database_id },
              properties: pageProps,
            }),
          })
          const data = await response.json()
          results.push({
            entry_id: entry.id,
            notion_page_id: data.id || null,
            ok: response.ok,
            error: response.ok ? null : (data.message || 'Failed'),
          })
        }
        return res.status(200).json({ results })
      }

      // Archive (soft-delete) a Notion page
      case 'archive': {
        if (!page_id) return res.status(400).json({ error: 'page_id is required' })
        const response = await fetch(`${NOTION_API}/pages/${page_id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ archived: true }),
        })
        const data = await response.json()
        if (!response.ok) return res.status(response.status).json(data)
        return res.status(200).json({ ok: true, id: data.id })
      }

      // Update a single Notion page
      case 'update': {
        if (!page_id || !properties) {
          return res.status(400).json({ error: 'page_id and properties are required' })
        }
        const response = await fetch(`${NOTION_API}/pages/${page_id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ properties }),
        })
        const data = await response.json()
        if (!response.ok) return res.status(response.status).json(data)
        return res.status(200).json({ ok: true, id: data.id })
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (err) {
    console.error('Notion proxy error:', err)
    return res.status(502).json({ error: 'Failed to reach Notion API' })
  }
}

// Split text into chunks of max 2000 chars (Notion rich_text limit)
function splitRichText(text) {
  if (!text || text.length <= 2000) {
    return [{ text: { content: text || '' } }]
  }
  const chunks = []
  for (let i = 0; i < text.length; i += 2000) {
    chunks.push({ text: { content: text.slice(i, i + 2000) } })
  }
  return chunks
}

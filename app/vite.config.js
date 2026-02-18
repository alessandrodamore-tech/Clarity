import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Dev middleware that emulates Vercel serverless /api/notion
function notionProxy() {
  const NOTION_API = 'https://api.notion.com/v1'
  const NOTION_VERSION = '2022-06-28'

  function splitRichText(text) {
    if (!text || text.length <= 2000) return [{ text: { content: text || '' } }]
    const chunks = []
    for (let i = 0; i < text.length; i += 2000) chunks.push({ text: { content: text.slice(i, i + 2000) } })
    return chunks
  }

  return {
    name: 'notion-proxy',
    configureServer(server) {
      server.middlewares.use('/api/notion', async (req, res) => {
        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }
        if (req.method !== 'POST') { res.writeHead(405); res.end(JSON.stringify({ error: 'Method not allowed' })); return }

        // Parse JSON body
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        let body
        try { body = JSON.parse(Buffer.concat(chunks).toString()) } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return }

        const { action, token, database_id, entries, cursor, page_id, properties } = body
        if (!token) { res.writeHead(400); res.end(JSON.stringify({ error: 'Token required' })); return }

        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Notion-Version': NOTION_VERSION }
        const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }

        try {
          if (action === 'test') {
            const r = await fetch(`${NOTION_API}/databases/${database_id}`, { headers })
            const d = await r.json()
            if (!r.ok) return json(r.status, d)
            const titleEntry = Object.entries(d.properties || {}).find(([, v]) => v.type === 'title')
            return json(200, { ok: true, title: d.title?.[0]?.plain_text || 'Untitled', title_property: titleEntry?.[0] || 'Title', properties: Object.keys(d.properties || {}) })
          }
          if (action === 'query') {
            const qBody = { page_size: 100, sorts: [{ timestamp: 'created_time', direction: 'descending' }] }
            if (cursor) qBody.start_cursor = cursor
            const r = await fetch(`${NOTION_API}/databases/${database_id}/query`, { method: 'POST', headers, body: JSON.stringify(qBody) })
            const d = await r.json()
            if (!r.ok) return json(r.status, d)
            return json(200, { results: d.results || [], has_more: d.has_more || false, next_cursor: d.next_cursor || null })
          }
          if (action === 'push') {
            if (!database_id || !entries?.length) return json(400, { error: 'database_id and entries required' })
            const titleProp = body.title_property || 'Annotazione'
            const results = []
            for (const entry of entries) {
              if (results.length > 0) await new Promise(r => setTimeout(r, 350))
              const r = await fetch(`${NOTION_API}/pages`, { method: 'POST', headers, body: JSON.stringify({ parent: { database_id }, properties: { [titleProp]: { title: splitRichText(entry.text || '') } } }) })
              const d = await r.json()
              results.push({ entry_id: entry.id, notion_page_id: d.id || null, ok: r.ok, error: r.ok ? null : (d.message || 'Failed') })
            }
            return json(200, { results })
          }
          if (action === 'archive') {
            if (!page_id) return json(400, { error: 'page_id required' })
            const r = await fetch(`${NOTION_API}/pages/${page_id}`, { method: 'PATCH', headers, body: JSON.stringify({ archived: true }) })
            const d = await r.json()
            if (!r.ok) return json(r.status, d)
            return json(200, { ok: true, id: d.id })
          }
          if (action === 'update') {
            if (!page_id || !properties) return json(400, { error: 'page_id and properties required' })
            const r = await fetch(`${NOTION_API}/pages/${page_id}`, { method: 'PATCH', headers, body: JSON.stringify({ properties }) })
            const d = await r.json()
            if (!r.ok) return json(r.status, d)
            return json(200, { ok: true, id: d.id })
          }
          json(400, { error: `Unknown action: ${action}` })
        } catch (err) {
          console.error('Notion proxy error:', err)
          json(502, { error: 'Failed to reach Notion API' })
        }
      })
    }
  }
}

export default defineConfig({ plugins: [react(), basicSsl(), notionProxy()] })

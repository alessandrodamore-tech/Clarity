import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, Table, Database, ClipboardPaste, ArrowLeft, ArrowRight, Check, X, Loader2, AlertCircle } from 'lucide-react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'

// ── Parsers ──

function parseDateStr(s) {
  if (!s) return null
  // YYYY-MM-DD
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // DD/MM/YYYY or MM/DD/YYYY — assume DD/MM
  m = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  // Month name
  const months = { january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12' }
  m = s.match(/(\w+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/i)
  if (m && months[m[1].toLowerCase()]) {
    const y = m[3] || new Date().getFullYear()
    return `${y}-${months[m[1].toLowerCase()]}-${m[2].padStart(2,'0')}`
  }
  m = s.match(/(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/i)
  if (m && months[m[2].toLowerCase()]) {
    const y = m[3] || new Date().getFullYear()
    return `${y}-${months[m[2].toLowerCase()]}-${m[1].padStart(2,'0')}`
  }
  return null
}

function parseTimeStr(s) {
  if (!s) return null
  const m = s.match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2,'0')}:${m[2]}` : null
}

function parseTextMarkdown(text) {
  const entries = []
  // Split by date-like headers
  const lines = text.split('\n')
  let currentDate = null, currentTime = null, currentLines = []

  const flush = () => {
    const txt = currentLines.join('\n').trim()
    if (txt && currentDate) {
      entries.push({ entry_date: currentDate, entry_time: currentTime, text: txt })
    } else if (txt && !currentDate) {
      // Try to find date in first line
      const d = parseDateStr(txt.split('\n')[0])
      entries.push({ entry_date: d || new Date().toISOString().slice(0,10), entry_time: null, text: txt })
    }
    currentLines = []
    currentTime = null
  }

  for (const line of lines) {
    // Check for date header: ## 2026-02-15, # February 15, bare date, --- separator
    const headerMatch = line.match(/^#{1,3}\s+(.+)/) || line.match(/^(\d{4}-\d{2}-\d{2})/)
    if (headerMatch) {
      const d = parseDateStr(headerMatch[1] || headerMatch[0])
      if (d) { flush(); currentDate = d; currentTime = parseTimeStr(line); continue }
    }
    if (line.trim() === '---') { flush(); continue }
    currentLines.push(line)
  }
  flush()
  return entries
}

function parseCSV(text) {
  // RFC 4180 compliant: handles quoted fields with newlines, commas, escaped quotes
  const rows = []
  let row = []; let field = ''; let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; continue }
      if (ch === '"') { inQuotes = false; continue }
      field += ch
    } else {
      if (ch === '"') { inQuotes = true; continue }
      if (ch === ',') { row.push(field.trim()); field = ''; continue }
      if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        if (ch === '\r') i++
        row.push(field.trim()); field = ''
        if (row.some(c => c)) rows.push(row)
        row = []; continue
      }
      field += ch
    }
  }
  row.push(field.trim())
  if (row.some(c => c)) rows.push(row)

  if (rows.length < 2) return []

  const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
  // Auto-detect columns (supports Italian: annotazione, momento)
  const textCol = headers.findIndex(h => /text|content|body|entry|journal|note|title|name|annotazione/.test(h))
  const dateCol = headers.findIndex(h => /date|day|when|created|momento/.test(h))
  const timeCol = headers.findIndex(h => h !== headers[dateCol] && /time|hour|ora/.test(h))

  if (textCol === -1) return []

  return rows.slice(1).map(cols => {
    const rawDate = dateCol >= 0 ? (cols[dateCol] || '') : ''
    const date = parseDateStr(rawDate) || new Date().toISOString().slice(0, 10)
    // Extract time from date column if combined (e.g. "January 9, 2026 9:58 AM")
    let time = timeCol >= 0 ? parseTimeStr(cols[timeCol]) : null
    if (!time && rawDate) {
      // Parse "9:58 AM" / "14:30" from the date string
      const ampm = rawDate.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
      if (ampm) {
        let h = parseInt(ampm[1])
        if (ampm[3].toUpperCase() === 'PM' && h !== 12) h += 12
        if (ampm[3].toUpperCase() === 'AM' && h === 12) h = 0
        time = `${String(h).padStart(2, '0')}:${ampm[2]}`
      } else {
        time = parseTimeStr(rawDate)
      }
    }
    const entryText = (cols[textCol] || '').replace(/\r/g, '').trim()
    return { entry_date: date, entry_time: time, text: entryText }
  }).filter(e => e.text)
}

function parsePastedText(text) {
  // Try to split by date patterns
  const datePattern = /(?:^|\n)(?:#{1,3}\s+)?(\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{4}|\w+\s+\d{1,2}(?:,?\s*\d{4})?)/gm
  const matches = [...text.matchAll(datePattern)]

  if (matches.length >= 2) {
    const entries = []
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i][0].indexOf(matches[i][1]) + matches[i][1].length
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length
      const d = parseDateStr(matches[i][1])
      const chunk = text.slice(start, end).trim()
      if (chunk && d) entries.push({ entry_date: d, entry_time: null, text: chunk })
    }
    if (entries.length) return entries
  }

  // No date patterns — treat as single entry
  if (text.trim()) {
    return [{ entry_date: new Date().toISOString().slice(0,10), entry_time: null, text: text.trim() }]
  }
  return []
}

// ── Components ──

const METHODS = [
  { id: 'text', icon: FileText, label: 'Text / Markdown', desc: 'Upload .txt or .md file' },
  { id: 'csv', icon: Table, label: 'CSV', desc: 'Upload a CSV file' },
  { id: 'notion', icon: Database, label: 'Notion Export', desc: 'CSV or Markdown from Notion' },
  { id: 'paste', icon: ClipboardPaste, label: 'Paste Text', desc: 'Paste your journal entries' },
]

export default function Import() {
  const { user, fetchEntries } = useApp()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [step, setStep] = useState(0) // 0=pick, 1=preview, 2=importing, 3=done
  const [method, setMethod] = useState(null)
  const [parsed, setParsed] = useState([])
  const [pasteText, setPasteText] = useState('')
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [importResult, setImportResult] = useState({ imported: 0, skipped: 0 })

  const handleFile = useCallback((file) => {
    if (!file) return
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      let entries
      if (method === 'csv' || (method === 'notion' && file.name.endsWith('.csv'))) {
        entries = parseCSV(text)
      } else {
        entries = parseTextMarkdown(text)
      }
      if (!entries.length) { setError('No entries could be parsed from this file.'); return }
      setParsed(entries)
      setStep(1)
    }
    reader.readAsText(file)
  }, [method])

  const handlePaste = () => {
    setError(null)
    const entries = parsePastedText(pasteText)
    if (!entries.length) { setError('No entries detected in the pasted text.'); return }
    setParsed(entries)
    setStep(1)
  }

  const removeEntry = (i) => setParsed(p => p.filter((_, j) => j !== i))

  const doImport = async () => {
    if (!user || !parsed.length) return
    setStep(2)
    setProgress({ done: 0, total: parsed.length })

    // Fetch existing entries to check duplicates
    const { data: existing } = await supabase
      .from('entries')
      .select('entry_date, raw_text')
      .eq('user_id', user.id)

    const existingSet = new Set((existing || []).map(e => `${e.entry_date}|${(e.raw_text||'').slice(0,100)}`))

    const toInsert = parsed.filter(e => !existingSet.has(`${e.entry_date}|${e.text.slice(0,100)}`))
    const skipped = parsed.length - toInsert.length

    // Batch insert in chunks of 50
    let imported = 0
    const BATCH = 50
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH).map(e => ({
        user_id: user.id,
        raw_text: e.text,
        entry_date: e.entry_date,
        entry_time: e.entry_time || '12:00',
        source: 'manual',
      }))
      const { error: err } = await supabase.from('entries').insert(batch)
      if (err) { setError(`Import error: ${err.message}`); setStep(0); return }
      imported += batch.length
      setProgress({ done: imported, total: toInsert.length })
    }

    setImportResult({ imported, skipped })
    await fetchEntries()
    setStep(3)
  }

  const reset = () => { setStep(0); setMethod(null); setParsed([]); setPasteText(''); setError(null) }

  // ── Render ──

  const cardStyle = (selected) => ({
    flex: '1 1 140px', padding: 20, borderRadius: 'var(--radius-lg)', cursor: 'pointer',
    background: selected ? 'rgba(232,168,56,0.12)' : 'rgba(255,255,255,0.4)',
    border: `1.5px solid ${selected ? 'rgba(232,168,56,0.4)' : 'rgba(255,255,255,0.3)'}`,
    backdropFilter: 'blur(20px)', textAlign: 'center', transition: 'all 0.2s',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => step === 0 ? navigate('/app/settings') : reset()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy)', padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>
          Import Journal
        </h1>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 12,
          background: 'rgba(220,60,60,0.1)', color: '#dc3c3c', fontSize: '0.85rem' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Step 0: Pick method */}
      {step === 0 && (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Choose how you'd like to import your journal entries.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {METHODS.map(m => (
              <div key={m.id} style={cardStyle(method === m.id)} onClick={() => { setMethod(m.id); setError(null) }}>
                <m.icon size={24} style={{ color: method === m.id ? '#9a7030' : 'var(--navy)' }} />
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--navy)' }}>{m.label}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{m.desc}</span>
              </div>
            ))}
          </div>

          {method && method !== 'paste' && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <input ref={fileRef} type="file" accept={method === 'csv' || method === 'notion' ? '.csv,.txt,.md' : '.txt,.md'}
                style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              <button onClick={() => fileRef.current?.click()} className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 32px' }}>
                <Upload size={16} /> Choose File
              </button>
            </div>
          )}

          {method === 'paste' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
                placeholder="Paste your journal entries here...&#10;&#10;Use date headers like:&#10;## 2026-02-15&#10;Today I felt great..."
                style={{
                  minHeight: 200, padding: 16, borderRadius: 'var(--radius-lg)', resize: 'vertical',
                  background: 'rgba(255,255,255,0.5)', border: '1.5px solid rgba(255,255,255,0.3)',
                  backdropFilter: 'blur(20px)', fontFamily: 'inherit', fontSize: '0.9rem',
                  color: 'var(--navy)', outline: 'none',
                }} />
              <button onClick={handlePaste} className="btn-primary" disabled={!pasteText.trim()}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <ArrowRight size={16} /> Parse Entries
              </button>
            </div>
          )}
        </>
      )}

      {/* Step 1: Preview */}
      {step === 1 && (
        <>
          <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 16 }}>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--navy)', margin: '0 0 4px' }}>
              {parsed.length} {parsed.length === 1 ? 'entry' : 'entries'} detected
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
              Review and remove any entries you don't want to import.
            </p>
          </div>

          <div className="glass" style={{ borderRadius: 'var(--radius-lg)', maxHeight: 400, overflowY: 'auto' }}>
            {parsed.map((e, i) => (
              <div key={i} style={{
                padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'flex-start',
                borderBottom: i < parsed.length - 1 ? '1px solid rgba(150,150,170,0.1)' : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                    <span>{e.entry_date}</span>
                    {e.entry_time && <span>{e.entry_time}</span>}
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--navy)', margin: 0, whiteSpace: 'pre-wrap',
                    overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {e.text}
                  </p>
                </div>
                <button onClick={() => removeEntry(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}>
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={reset} style={{
              flex: 1, padding: '12px 24px', borderRadius: 100, background: 'rgba(150,150,170,0.08)',
              border: '1px solid rgba(150,150,170,0.15)', color: 'var(--text-muted)',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
            }}>Cancel</button>
            <button onClick={doImport} disabled={!parsed.length} className="btn-primary"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Upload size={16} /> Import {parsed.length} {parsed.length === 1 ? 'entry' : 'entries'}
            </button>
          </div>
        </>
      )}

      {/* Step 2: Importing */}
      {step === 2 && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 32, textAlign: 'center' }}>
          <Loader2 size={32} style={{ color: 'var(--amber)', animation: 'spin 1s linear infinite', marginBottom: 16 }} />
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>
            Importing entries…
          </p>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              height: '100%', borderRadius: 3, background: 'var(--amber)', transition: 'width 0.3s',
              width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
            }} />
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {progress.done} / {progress.total}
          </p>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 3 && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 32, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(56,189,148,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Check size={24} style={{ color: '#0d9668' }} />
          </div>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--navy)', marginBottom: 8 }}>
            Import Complete
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 4 }}>
            {importResult.imported} {importResult.imported === 1 ? 'entry' : 'entries'} imported
          </p>
          {importResult.skipped > 0 && (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>
              {importResult.skipped} duplicate{importResult.skipped !== 1 ? 's' : ''} skipped
            </p>
          )}
          <button onClick={() => navigate('/app')} className="btn-primary" style={{ marginTop: 20, padding: '12px 32px' }}>
            Go to Journal
          </button>
        </div>
      )}
    </div>
  )
}

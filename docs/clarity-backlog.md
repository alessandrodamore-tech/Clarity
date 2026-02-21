# Clarity — Backlog
_Analisi del codice: 2026-02-20 | Stack: React + Vite + Supabase + Gemini + Vercel_

---

## 🐛 Bug confermati nel codice

### Critici
- [x] **entries_source_check constraint** — ✅ Fixato il 2026-02-20: constraint aggiornato via SQL Editor, accetta 'manual', 'import', 'notion'. Verificato con test insert.
- [x] **Tabella `user_reminders`** — ✅ Già esistente (migration v0.3 applicata). Cross-device persistence attiva.

### UI / UX (da journal di Ale)
- [x] Interfaccia iPhone zooma quando si scrive — ✅ fixato: tutti gli input ora 16px + safety net globale CSS
- [ ] Avviso "aggiorna promemoria" rimane dopo aver aggiornato — da verificare
- [x] Notion sync push (Clarity → Notion) — ✅ verificato funzionante il 2026-02-20
- [ ] Notion sync update (modifica entry in Clarity → aggiorna Notion) — da verificare
- [x] Spazio troppo grande tra ultima entry e input bar — ✅ padding-bottom 80px → 140px
- [x] Orario non allineato con "write anything…" — ✅ flex-start + paddingTop 3px
- [x] Fluidità generale UI — ✅ transition specifiche, touch feedback scale(0.99), hover disabilitato su touch

### Bug trovati analizzando il codice
- [x] **hashEntries inconsistente** — ✅ aggiunto .sort() in gemini.js
- [ ] **`clarity_insights` localStorage key** — codice morto, cleanup bassa priorità
- [ ] **Modal origin stale** — potenziale crash silente se entry eliminata mentre modal aperto
- [ ] **Reminders: più upsert separati su Supabase** — ottimizzazione bassa priorità

---

## ✨ Feature da implementare

### Alta priorità
- [ ] **Analisi automatica nuove entry** — dopo `addEntry` in `store.jsx`, chiamare `extractDayData` in background con le entry del giorno corrente. I reminder già lo fanno (incremental update), analisi giornaliera no.
  - Attenzione: evitare troppe chiamate API. Suggerisco debounce 30sec dopo l'ultima entry del giorno
- [ ] **Estrazione automatica promemoria dalle annotazioni** — già implementata come incremental update in `Reminders.jsx`. Da verificare se funziona bene o ha edge case

### Media priorità
- [ ] **Home → chat con AI** — refactoring significativo di `Home.jsx`. L'entry viene inviata, l'AI risponde, crea annotazione + promemoria + aggiorna trends. Idea animazione: pallino che si divide in 3 verso le 3 sezioni
- [ ] **Promemoria strutturati** — obiettivi + task sequenziali. Schermata swipe stile Tinder per fare/rimandare task

---

## 🎯 Vision / Mission (non dimenticare)
- **No consigli medici** (feedback Guido + Spino — critico per legalità)
- **Obiettivo**: utente non autocosciente dei propri sintomi → li identifica → riceve suggerimento specialista → report completo da mostrare al medico
- Non diagnosi, non terapia — solo identificazione e report

---

## ✅ Già fatto
- ✅ Migration v0.4 applicata (2026-02-20) — entries_source_check ora accetta 'notion' e 'import'
- ✅ Migration v0.3 già presente — tabelle user_reminders e user_reports esistenti e funzionanti
- ✅ Supabase service role key configurata in `/home/node/.config/clarity/config.env`
- ✅ MVP deployato su Vercel (clarity-dusky.vercel.app)
- ✅ Pagina Trends con report clinico AI (7 sezioni)
- ✅ Pagina Reminders (tabs: Reminders / Answers / Suggestions, swipe, badge)
- ✅ Pagina Profile con contesto personale iniettato in tutti i prompt
- ✅ Notion two-way sync
- ✅ Cross-device persistence via Supabase
- ✅ iPhone safe areas + page transitions
- ✅ Onboarding Liquid Glass
- ✅ v0.1 → v0.3.3 su GitHub

---

## 📐 Architettura (utile per sviluppo)
- `store.jsx` — state globale: auth + entries CRUD + auto-sync Notion
- `gemini.js` — tutta la logica AI: extractDayData, generateGlobalInsights, generateReminders, generatePlaceholderHints, analyzeEntry
- `notion.js` — sync Notion (proxy serverless su Vercel)
- Deploy: push su `main` → Vercel auto-deploys
- Variabile `GEMINI_API_KEY` su Vercel (server-side), mai in bundle client

# Brief per Claude Code — Clarity

Questo file è il punto di partenza per qualsiasi sessione di sviluppo su Clarity.
Leggilo prima di fare qualsiasi cosa.

---

## Chi sono e cosa è Clarity

Mi chiamo Ale, ho 21 anni e l'ADHD. Clarity è l'app che ho costruito per tracciare il mio umore, energia, farmaci e pensieri con testo libero. L'AI estrae pattern e genera report clinici strutturati da mostrare al medico.

Stack: **React + Vite + Supabase + Gemini + Vercel**

---

## File da leggere subito

1. `docs/clarity-plan.md` — piano strategico completo (analisi multi-agente: UX, architettura, AI, GTM)
2. `docs/clarity-backlog.md` — bug confermati e feature da implementare
3. `CLAUDE.md` — note tecniche sul progetto (migration history, schema, deploy)

---

## Priorità assoluta — cosa fare in questa sessione

### 🔴 Fix bloccanti (da fare nell'ordine)

1. **RLS DELETE mancante** — le delete non funzionano su Supabase per nessuna tabella
   - Tabelle: `entries`, `user_reports`, `user_reminders`
   - Fix: aggiungere policy RLS `DELETE` per `auth.uid() = user_id` su tutte e 3
   - Tempo stimato: 15 minuti (SQL puro su Supabase)

2. **Verificare modello Gemini** — `gemini-3-pro-preview` potrebbe non esistere ufficialmente
   - Testare se risponde correttamente
   - Fallback: `gemini-2.0-pro-exp`

3. **Fix back navigation DayDetail** — `navigate('/app')` → `navigate(-1)`
   - File: trovare il componente DayDetail
   - Tempo: 5 minuti

4. **Conferma prima di delete** — aggiungere dialog di conferma prima di eliminare un'entry
   - Prevenire tap accidentale = perdita dati permanente
   - Tempo: 30 minuti

5. **Upsert atomico `user_reminders`** — 3 upsert separati sovrascrivono i campi a vicenda
   - Consolidare in 1 upsert atomico con tutti i campi
   - Tempo: 2 ore

---

## Vincoli importanti

- **NO consigli medici** nell'AI — solo identificazione pattern e suggerimento di parlarne con un medico
- **Annotazioni Notion**: vengono create dall'app Clarity e matchate sul campo titolo — non modificare la struttura della sync Notion
- **Deploy**: push su `main` → Vercel auto-deploys (non serve fare nulla di manuale)
- **Gemini API key**: è una variabile server-side su Vercel (`GEMINI_API_KEY`), mai esporla nel bundle client

---

## Note su Supabase

- Service role key: in `/home/node/.config/clarity/config.env` (non nel repo)
- Le migration sono in `supabase/migrations/`
- Per applicare SQL: usare l'SQL Editor di Supabase dashboard

---

## Come lavorare

1. Leggi i file in `docs/` prima di tutto
2. Affronta i fix nell'ordine della lista sopra
3. Dopo ogni fix, verifica che non abbia rotto nulla
4. Push su main = deploy automatico su Vercel

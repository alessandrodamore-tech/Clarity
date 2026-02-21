# Clarity — Piano Strategico Completo
_Data: 2026-02-20 | Analisi multi-agente (4 worker specializzati)_

---

## Executive Summary

> 5 cose da sapere prima di qualsiasi altra cosa

1. **La DELETE non funziona per nessun utente** — policy RLS mancante su Supabase. L'entry sparisce dalla UI ma rimane nel DB. Da fixare in 15 minuti prima di qualsiasi altro lavoro.
2. **Il posizionamento è genuinamente unico** — nessun competitor converte input libero (testo scritto come si vuole) in report clinico strutturato. Il moat esiste. Va comunicato meglio.
3. **Il modello AI potrebbe non esistere** — `gemini-3-pro-preview` non è un modello rilasciato ufficialmente. Tutta l'AI di Clarity potrebbe girare su fallback. Verificare subito.
4. **La storia di Ale è il marketing** — 21 anni, ADHD, costruisce l'app che non esiste. Questo racconto su Reddit ADHD e TikTok vale più di qualsiasi campagna. Non usarla ancora è il vero costo opportunità.
5. **Il prodotto funziona, ma non è pronto per il lancio pubblico** — 3 bug critici bloccanti (DELETE, corruzione reminders, modello AI), e il multi-device è rotto. Con ~15 ore di fix, si può lanciare.

---

## 1. UX & Prodotto

### Pain Point Critici (da fixare ora)

- 🔴 **Delete senza conferma** → tap accidentale = entry persa per sempre
- 🔴 **Back button DayDetail** → `navigate('/app')` hardcoded, torna sempre a Home invece che indietro
- 🔴 **Badge reminders falso positivo** → mostra notifica anche quando non ci sono nuovi item → erode fiducia
- 🟡 **Lingua mista EN/IT** → `"scaduto"`, `"Vedi tutti →"`, `"oggi"` sparsi in UI altrimenti inglese
- 🟡 **Re-analyze silenzioso** → sovrascrive reminder esistenti senza warning né undo
- 🟡 **DayDetail non discoverable** → la feature AI più potente è nascosta, molti utenti non la trovano mai
- 🟡 **Nessun mood rating** → gap critico vs tutti i competitor (Bearable, Daylio, Reflectly lo hanno)

### Cosa Funziona Bene (non toccare)

- ✅ Visual design: glass morphism, animazioni, shadow system — premium e distinctivo
- ✅ Feed chat-style con day separator — familiar, bassa cognitive load
- ✅ Smart hints dal context AI — riducono ansia da pagina bianca
- ✅ Animation system polished — modal morph, staggered reveal, slide-out
- ✅ Smart reminder sort: overdue → today → priority → upcoming → no-date
- ✅ Offline-first con localStorage + Supabase sync

### Gap vs Competitor

| Feature | Clarity | Bearable | Daylio | Reflectly |
|---|:---:|:---:|:---:|:---:|
| AI insight estratti da testo libero | ✅ **unico** | ❌ | ❌ | ⚠️ |
| Mood rating rapido | ❌ | ✅ | ✅ | ✅ |
| Dark mode | ❌ | ✅ | ✅ | ✅ |
| Privacy lock (PIN/biometria) | ❌ | ✅ | ✅ | ✅ |
| Export dati (PDF/CSV) | ❌ | ✅ | ✅ | ❌ |
| Push notifications native | ⚠️ web-only | ✅ | ✅ | ✅ |
| Clinical report | ✅ **unico** | ❌ | ❌ | ❌ |

### Top 5 Fix UX (ordinati per impatto/effort)

1. **Conferma prima di delete** — 30 min, zero rischio, previene perdita dati
2. **Fix back navigation DayDetail** — 5 minuti (`navigate(-1)` al posto di `navigate('/app')`)
3. **Mood quick-select sull'input** — 5 emoji sopra la textarea, dati critici per AI e trends
4. **Unificare lingua → tutto EN** — 2 ore, qualità percepita immediata
5. **Day separator pill cliccabile → DayDetail** — 1 ora, discovery organica della feature AI

---

## 2. AI & Gemini

### Uso Attuale

- **6 funzioni AI attive:** `extractDayData`, `generateGlobalInsights`, `generateReminders`, `generatePlaceholderHints`, `analyzeEntry`, `findMissedReminders`
- **Temperature basse (0.20–0.30)** per task deterministici — scelta corretta
- **Cache a doppio livello** (localStorage + Supabase) — ottimizzazione costi buona
- **Retry con backoff esponenziale** — resilienza implementata

### Il Problema Critico: Il Modello Non Esiste

- `gemini-3-pro-preview` non è ufficialmente rilasciato (febbraio 2026)
- L'app potrebbe girare su un fallback silenzioso
- **Fix immediato:** testare response, poi usare `gemini-2.0-pro-exp` se il modello non risponde correttamente
- Il codice è già pronto per gestire thinking model output (filtra `thought: true`) — buon forward-planning

### Qualità Prompt: Cosa Funziona

- ✅ Rilevamento lingua automatico (italiano/inglese/multilingua)
- ✅ `userContext` iniettato in tutti i prompt
- ✅ Categorie actions granulari (medication, caffeine, exercise, therapy...)
- ✅ Anti-null guards nei prompt
- ✅ `repairJSON` per output malformati

### Opportunità AI (ordinate per priorità)

1. **JSON Schema Enforcement (`responseSchema`)** — elimina repair JSON, zero allucinazioni strutturali, effort basso
2. **Separare `generateReminders`** — ora fa 4 task in 1 prompt, qualità soffre
3. **Chain-of-thought esplicito** nei prompt di pattern detection
4. **Chat conversazionale sull'intero journal** — "quando mi sento meglio di solito?" con context window 1M token
5. **Pattern detection quantitativa** — correlazioni reali (Elvanse → focus score, sonno → mood next day)
6. **Proactive AI** — anomaly detection, alert pattern, medication adherence

### Come Diventare Differenziatore

> Il vero moat non è l'AI (diventerà commodity). È la **combinazione di dati longitudinali personali + fiducia utente + correlazioni validate nel tempo.**

- Ogni giorno di utilizzo rende Clarity più utile per quell'utente specifico
- I competitor non possono copiare lo storico
- Direzione: da "AI che riassume" a "AI che predice e avvisa"

---

## 3. Architettura & Backend

### Stato Supabase

**Schema attuale:**
- `entries` — ok strutturalmente
- `user_reports` — JSONB monolitico (scalabilità limitata)
- `user_reminders` — JSONB con 3 campi separati (fonte di corruzione)

**RLS — Stato Critico:**

| Tabella | SELECT | INSERT | UPDATE | DELETE |
|---|:---:|:---:|:---:|:---:|
| `entries` | ✅ | ✅ | ✅ | ❌ **MANCANTE** |
| `user_reports` | ✅ | ✅ | ✅ | ❌ **MANCANTE** |
| `user_reminders` | ✅ | ✅ | ✅ | ❌ **MANCANTE** |

### Bug Critici (ordinati per severità)

- 🔴 **BUG #1: DELETE non funziona** → RLS mancante su tutte e 3 le tabelle → 15 minuti di fix SQL
- 🔴 **BUG #2: Corruzione silente `user_reminders`** → 3 upsert parziali separati sovrascrivono i campi degli altri → fix: unico upsert atomico con tutti i campi
- 🟡 **BUG #3: Notion sync map solo in localStorage** → cambio dispositivo → duplicati garantiti su Notion → serve tabella `notion_sync_map` su Supabase
- 🟡 **BUG #4: AI context (Profile) mai persistito su Supabase** → si perde su nuovo dispositivo
- 🟡 **BUG #5: Race condition `autoSyncEntry`** → hardcoded delay 1.5s, sync silenziosamente fallisce su connessioni lente
- 🟡 **BUG #6: `updateEntry` non ricalcola date in optimistic state** → inconsistenze di ordinamento senza reload

### Scalabilità

| Soglia | Cosa si rompe |
|---|---|
| **100 utenti** | No index su `entries(user_id, entry_date)` → query full-scan; Notion push sequenziale → timeout Vercel |
| **1.000 utenti** | Fetch ALL entries senza LIMIT → memory leak; JSONB non indicizzato → query lente; Gemini prompt illimitato → costi lineari |
| **Punto di rottura critico** | Utenti con >500 entries: il modello "fetch tutto, manda tutto a Gemini" collassa |

### Priorità Tecniche (ordinati)

1. **Fix RLS DELETE** — 15 minuti SQL, blocca il lancio
2. **Upsert atomico `user_reminders`** — 2 ore, previene corruzione dati
3. **Persist Notion sync map + AI context su Supabase** — 4-5 ore, multi-device funzionante
4. **Index DB + paginazione entries + limit contesto Gemini** — ~6 ore, scalabilità

---

## 4. Mercato & Monetizzazione

### Target Primario

**"Il Tracker Frustrato" — ADHD adulto, 22–38 anni**
- In trattamento farmacologico, visita specialista ogni 1–3 mesi
- Vorrebbe portare dati reali alle visite, finisce per raccontare "a sentimento"
- Tech-literate, già su Notion/fogli Excel/Apple Notes
- TAM realistico: 2–3M utenti EU+US ad alta propensione all'adozione

**Pain point centrale:** *"L'appuntamento dura 15 minuti. Lo specialista chiede come è andata. Non ricordo con precisione l'ultima settimana."*

### Competitor Landscape

| Competitor | Approccio | Overlap | Weakness |
|---|---|---|---|
| **Bearable** | Form strutturati + slider | Alto | Friction d'input incompatibile con ADHD |
| **Daylio** | Mood emoji gamificato | Medio | Superficiale, no AI reale |
| **Reflectly** | Journaling guidato AI | Basso | Nessun clinical report |
| **Woebot** | CBT chatbot | Nessuno | Non è un tracker |

**Posizionamento unico:** input qualitativo libero → output clinico strutturato. **Nessun competitor fa entrambe le cose.**

### Proposta di Valore Unica

> **"Write like texting. Get clinical data."**

Le 5 unicità reali:
1. Zero friction input → AI estrae struttura (opposto di tutti i competitor)
2. Clinical report con 8 sezioni (executive summary, mood trend, hypotheses, medication analysis, recommendations, routine, experiments) — nessun consumer produce qualcosa di comparabile
3. Smart reminders estratti automaticamente dal testo
4. AI context personalizzato persistente per ogni utente
5. Notion sync bidirezionale — unico nel mental health tracking

### Modello di Business

**Fase 1 (0–12 mesi): Freemium B2C**

- **Free:** journaling illimitato, analisi base 1/giorno, trends settimanali, 3 reminder attivi
- **Premium €7.99/mese o €59.99/anno:** clinical report completo + export PDF, AI illimitata, reminder illimitati, Notion sync, medication analysis

*Perché funziona:* il report clinico ha valore misurabile (visita specialista = €50–200). Pagare €8/mese per migliorare quella visita è ovvio.

**Fase 2 (12–24 mesi): B2B Clinicians**
- €19–29/paziente/mese (clinico paga per i pazienti da monitorare)
- Richiede: compliance GDPR-healthcare, testimonials utenti reali, traction B2C prima

**Unit economics anno 1 (conservativo):** 2.000 utenti, 8% conversion = 160 paying, ARPU €59 → ARR ~€9.500. Anno 2: 12.000 utenti → ARR ~€78K.

### Canali di Acquisizione (ordinati per ROI)

1. **Community ADHD Reddit** (r/ADHD — 3.9M iscritti) — Ale posta come founder-user, storia personale autentica, costo €0
2. **TikTok/Reels** — nicchia ADHD esplosa, Ale è il creator naturale, format: screen recording + narrazione personale
3. **Product Hunt** — dopo 20+ utenti reali con testimonials, puntare top 5 del giorno
4. **Psicologi/psichiatri content creator** — DM personalizzato, account premium gratis in cambio di feedback genuino
5. **SEO** — "ADHD mood tracker app", "diario salute mentale AI", "app per tracciare effetti farmaci ADHD"

**Da evitare ora:** Google/Meta Ads (CAC troppo alto pre-traction), PR generalista, influencer pagati.

---

## 5. Roadmap Prioritizzata

### 🔴 Immediato — questa settimana
> Solo le cose che sbloccano il lancio

- [ ] **Fix RLS DELETE su Supabase** — 3 policy SQL, 15 minuti. Senza questo la delete non funziona per nessun utente
- [ ] **Verificare modello Gemini** — testare se `gemini-3-pro-preview` risponde correttamente; se no, fallback a `gemini-2.0-pro-exp`
- [ ] **Fix back navigation DayDetail** — cambiare `navigate('/app')` con `navigate(-1)`, 5 minuti
- [ ] **Delete confirmation dialog** — aggiungere stato `confirmDelete` in `EntryDetailModal`, 30 minuti
- [ ] **Upsert atomico `user_reminders`** — consolidare 3 upsert separati in 1, 2 ore, previene corruzione silenziosa

### 🟠 Breve termine — 1 mese
> Rendono l'app competitiva

- [ ] **Mood quick-select** (5 emoji sopra textarea) — colma il gap critico vs tutti i competitor
- [ ] **Persist AI context (Profile) su Supabase** — multi-device, 1 ora
- [ ] **Notion sync map su Supabase** (tabella `notion_sync_map`) — elimina duplicati su cambio dispositivo
- [ ] **Unificare lingua → tutto EN** — cleanup strings IT sparse, 2 ore
- [ ] **Primo post su r/ADHD** — storia personale di Ale, no product pitch, costo €0

### 🟡 Medio termine — 3 mesi
> Crescita e differenziazione

- [ ] **Export PDF del clinical report** — feature che giustifica il pagamento Premium, altissimo valore percepito
- [ ] **JSON Schema enforcement in Gemini** (`responseSchema`) — elimina repair JSON, aumenta qualità output
- [ ] **Paginazione entries + index DB + limit Gemini context** — scalabilità fino a migliaia di utenti
- [ ] **Chat conversazionale sull'intero journal** — "quando mi sento meglio?" risposta in linguaggio naturale
- [ ] **Lancio stripe + tier Premium** — non aspettare la perfezione, lanciare a €7.99/mese

### ⚪ Non fare ora
> Evitare / rimandare — importante quanto sapere cosa fare

- ❌ **App nativa iOS/Android** — PWA funziona, il nativo costa mesi. Prima validare il prodotto
- ❌ **B2B Clinicians** — richiede compliance, sales cycle lungo, impossibile senza traction B2C
- ❌ **Google/Meta Ads** — CAC insostenibile pre-traction, budget sprecato
- ❌ **Feature wearable (Oura, Whoop)** — distrae dalla missione, piace ai biohacker ma non al core target
- ❌ **Dark mode** — nice-to-have, non blocca nessun utente reale; fare dopo i fix critici
- ❌ **Teens/adolescenti come target** — regulatory nightmare (COPPA/GDPR minori)
- ❌ **Enterprise wellness** — sales cycle lungo, prodotto pre-traction
- ❌ **Multi-lingua i18n completo** — scegliere EN ora, aggiungere IT/altri quando c'è traction

---

## 6. La mossa più importante

> Una sola cosa. La più impattante in assoluto per Clarity adesso.

**Fissa i 3 bug bloccanti (RLS delete + Gemini model + upsert reminders) in un pomeriggio, poi posta su r/ADHD la storia personale di Ale.**

Perché è questa e non altro:
- Senza i fix, qualsiasi utente che prova l'app trova che la delete non funziona → abbandono immediato, fiducia distrutta
- Con i fix, il prodotto è abbastanza solido da mostrarlo a persone reali
- Il post su r/ADHD è il canale con ROI più alto esistente: costo €0, audience perfetta (3.9M iscritti), storia di Ale è genuina e potente
- Qualsiasi altra cosa (feature nuove, design, monetizzazione) è secondaria finché non ci sono utenti reali che usano l'app e rimangono

**Il giorno dopo i fix, Ale scrive su r/ADHD:** *"Ho 21 anni e l'ADHD. Ho costruito l'app che non trovavo da nessuna parte. La sto usando da [N mesi]. Vuoi provarla?"* — e mette screenshot reali del suo journal (oscurato quanto necessario).

Quella è la mossa che sblocca tutto.

---
_Piano generato da analisi multi-agente: UX Worker · Architettura Worker · GTM Worker · AI Worker_

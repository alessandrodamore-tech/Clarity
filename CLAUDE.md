# CLAUDE.md — Clarity Project Context

## Mission & Why This Exists

**Clarity è un diario intelligente per la salute mentale.** Scrivi liberamente del tuo giorno — come faresti in un messaggio — e un assistente AI lavora silenziosamente per te: capisce come ti senti, riconosce pattern nel tuo umore, energia e farmaci, ti ricorda le cose da fare che hai menzionato senza che tu debba creare liste, ti suggerisce cosa monitorare e ti avvisa quando qualcosa non va.

È il ponte tra il qualitativo e il quantitativo: le tue parole diventano dati, i dati diventano insight, gli insight diventano un report clinico strutturato che puoi esportare e portare al tuo specialista — così chi ti cura vede settimane di dati reali, non il racconto vago di una visita di quindici minuti.

Zero friction per scrivere, massimo valore in uscita. Pensato per chi convive con ADHD, disturbi dell'umore o semplicemente per chi vuole capirsi meglio senza fare fatica.

### The Personal Story
Alex (the founder, 21) has ADHD and tracks his mood, energy, medications, and daily experiences. He was doing this manually on Notion with timestamped annotations — dozens per day. Clarity was born to replace that workflow with something purpose-built: zero-friction input, automatic pattern detection, and cross-day insights.

### The Strategic Goal
Alex is applying to **Nova SBE (Lisbon)** for the Master in Impact Entrepreneurship & Innovation. His academic profile is average (GPA ~23/30), so the application relies on a strong **entrepreneurial narrative**. Clarity is the proof — a real product, built and shipped, that shows initiative, technical skill, and genuine problem-solving.

The app needs to be **publicly presentable as a product**, not just a personal tool. Think: polished enough that a stranger could sign up, use it, and get value from it.

### Design Philosophy
- **Zero friction**: writing an entry should feel like texting yourself
- **AI stays out of the way**: the Home feed is pure journaling, no AI clutter. Analysis lives in dedicated pages (Trends, DayDetail, Reminders)
- **Beautiful but not flashy**: glass morphism, soft gradients, calm palette. It's a mental health app — the UI should feel safe and quiet
- **Mobile-first**: designed as a personal diary app, used primarily from phone

## What is Clarity?
A smart mental health journal. Write freely about your day — AI extracts patterns, generates reminders, and builds clinical reports you can share with your specialist. Qualitative in, quantitative out.

## Tech Stack
- **Frontend**: React 19 + Vite, no component library, no charting library — everything hand-built
- **Backend**: Supabase (auth, Postgres, RLS)
- **AI**: Google Gemini API (`gemini-3-pro-preview`) for per-day analysis + cross-day reports + smart reminders + smart hints
- **Styling**: Custom CSS with glass morphism design system (CSS variables, `className="glass"`)
- **Deployment**: Vercel (auto-deploy from GitHub, serverless API proxy for Gemini)
- **No TypeScript** — plain JSX

## Run
```bash
cd app
cp .env.example .env  # fill in Supabase + Gemini keys
npm install
npx vite --host --port 5173
```

## Environment Variables

### Local development (app/.env)
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_GEMINI_API_KEY=<gemini-api-key>
```

### Vercel production
```
VITE_SUPABASE_URL=https://<project>.supabase.co    # baked into client bundle (safe — public key)
VITE_SUPABASE_ANON_KEY=<anon-key>                  # baked into client bundle (safe — RLS protected)
GEMINI_API_KEY=<gemini-api-key>                     # server-side only, used by /api/gemini proxy
```
**DO NOT set `VITE_GEMINI_API_KEY` on Vercel** — it would expose the key in the client bundle. The app auto-detects: if `VITE_GEMINI_API_KEY` is missing, it routes through the `/api/gemini` serverless proxy.

## Architecture

### Pages (src/pages/)
| File | What it does |
|------|-------------|
| `Home.jsx` | Main feed — continuous entries oldest→newest, fixed input bar at bottom (chat-style) with Trends/Reminders nav buttons flanking it, AI hint chips above input (visible while typing, with refresh button), send icon button |
| `DayDetail.jsx` | Full day view: AI insight card, entries (click to edit), AI-extracted actions with manual overrides |
| `Trends.jsx` | Orchestrator: WellnessHero (heatmap + stats), AnalysisReport (AI clinical report with disclaimer banner), DetailedStats (time distribution + day-of-week) |
| `Reminders.jsx` | Tabbed UI (Reminders / Answers / Suggestions) with swipe navigation. Re-analyze button in header. Auto-incremental update on new entries. Due dates on reminders with browser notifications. Checkbox persistence + archive. No alerts section |
| `Profile.jsx` | User info + AI context textarea. Context injected into ALL Gemini calls |
| `Import.jsx` | Import wizard: text/CSV/Notion export/paste, preview, dedup, batch insert |
| `Settings.jsx` | Profile + AI context + Notion sync + Import link + About + Sign Out (merged Profile+Settings) |
| `Login.jsx` | Auth (login/signup) with Supabase |

### Core Libraries (src/lib/)
| File | What it does |
|------|-------------|
| `gemini.js` | All AI logic: `callGemini()`, `extractDayData()`, `generateGlobalInsights()`, `generateReminders()`, `generatePlaceholderHints()`, `analyzeEntry()`, `findMissedReminders()`, `getUserContext()`, `loadCachedSummaries()`, `clearSummaryCache()`. Thinking model support: filters `thought` parts from response |
| `notion.js` | Notion two-way sync: `testNotionConnection()`, `pushToNotion()`, `pullFromNotion()`, `autoSyncEntry()`, `autoUpdateNotionEntry()`, `cleanupNotionDuplicates()`, credential management, sync map |
| `store.jsx` | React context: auth state, entries CRUD, `useApp()` hook, auto-sync to Notion on addEntry + updateEntry, auto-pull from Notion on app load |
| `supabase.js` | Supabase client init |
| `constants.js` | Shared constants |

### Components (src/components/)
| File | What it does |
|------|-------------|
| `Layout.jsx` | Top bar: Settings/gear (left), "Clarity." (center), Help/? (right, triggers Liquid Glass onboarding bottom sheet). Page transitions (opacity fade). Scroll-to-top on route change. Safe area support for iPhone. Trends/Reminders in Home bottom bar |
| `EntryDetailModal.jsx` | Read-first entry modal with AI actions (Analyze, Ask anything). Edit mode via pencil icon. Replaced EditEntryModal.jsx |
| `EmptyState.jsx` | Reusable empty state component |
| `ErrorBoundary.jsx` | React error boundary with refresh fallback |
| `Onboarding.jsx` | First-time user onboarding flow |
| `trends/WellnessHero.jsx` | GitHub-style heatmap grid + stats row (streak, days tracked, entries count) |
| `trends/AnalysisReport.jsx` | Document-style AI clinical report with 7 sections: observations, hypotheses, medication analysis, recommendations, ideal routine, experiments |
| `trends/DetailedStats.jsx` | Time-of-day distribution chart + day-of-week patterns (self-contained, computes own data) |

### Styling (src/index.css)
- CSS variables: `--font-display`, `--navy`, `--amber`, `--text-muted`, `--text-light`, `--radius-lg`
- `.glass` class: frosted glass cards with `::before`/`::after` pseudo-elements for highlights
- `.glass-textarea` class: frosted textarea with 16px border-radius (use for multiline input)
- `.feed-send` class: subtle circular send button with opacity transitions
- `.bottom-nav-btn` class: circular liquid glass navigation buttons flanking input bar
- `.hint-chip` class: glass pill chips for AI hints (no box-shadow, no ::after)
- `.hint-tray` class: horizontal scrollable chip container
- Pastel gradient background
- No external CSS framework

## Supabase Schema

### `entries` table
```sql
id uuid PK DEFAULT gen_random_uuid()
user_id uuid FK → auth.users NOT NULL
raw_text text NOT NULL
entry_date date NOT NULL
entry_time time NOT NULL DEFAULT '12:00'
source text NOT NULL DEFAULT 'manual'  -- CHECK: entries_source_check
created_at timestamptz DEFAULT now()
```
- RLS enabled: users see only their own entries

### `day_analyses` table
```sql
id uuid PK DEFAULT gen_random_uuid()
user_id uuid FK → auth.users NOT NULL
entry_date date NOT NULL
summary text
insight text
substances jsonb  -- actually stores "actions" (backward compat column name)
entries_hash text
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
UNIQUE(user_id, entry_date)
```
- RLS enabled

### `user_reports` table (v0.3)
```sql
id uuid PK DEFAULT gen_random_uuid()
user_id uuid FK → auth.users NOT NULL
report_data jsonb NOT NULL DEFAULT '{}'
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
UNIQUE(user_id)
```
- RLS enabled. Stores the Trends page AI clinical report. Persists across devices.

### `user_reminders` table (v0.3)
```sql
id uuid PK DEFAULT gen_random_uuid()
user_id uuid FK → auth.users NOT NULL
reminders_data jsonb NOT NULL DEFAULT '{}'
done_items jsonb NOT NULL DEFAULT '[]'
processed_ids jsonb NOT NULL DEFAULT '[]'
entries_hash text
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
UNIQUE(user_id)
```
- RLS enabled. Stores reminders, done state, and processed entry IDs. Persists across devices.

## AI / Gemini Details

### Model
- **Current**: `gemini-3-pro-preview` (thinking model — needs high `maxOutputTokens` because thinking tokens consume the budget)
- **DO NOT use** `gemini-2.5-flash` — it's a thinking model that truncates JSON
- **DO NOT add** `thinkingConfig: { thinkingBudget: 0 }` — causes 400 error
- Use `maxOutputTokens: 4096+` for hint generation, `8192` for reports — thinking tokens can consume 200+ tokens before any output

### `getUserContext()`
Reads `clarity_user_context` from localStorage. Returns context block injected into all AI prompts. Users write this in Profile page (medical conditions, medications, abbreviations, goals).

### `extractDayData(entries, userId, cachedData, previousDays)`
Single API call per day → returns `{ summary, insight, actions, entriesHash }`
- `summary`: 1-2 sentence day summary
- `insight`: observations, cause-effect, comparison with previous days (NEVER null)
- `actions`: AI-extracted wellness-relevant actions (medications, exercise, caffeine, etc.)
- Includes user context if available

### `generateGlobalInsights(daySummaries)`
Cross-day clinical wellness report. Returns JSON with 8 fields:
- `executive_summary`, `mood_trend` (improving|stable|declining|fluctuating)
- `confirmed_observations[]` (title, detail, impact)
- `hypotheses[]` (title, detail, confidence_pct, evidence_for/against, test_suggestion)
- `medication_substance_analysis[]` (name, type, frequency, effects, mood/energy/focus impact, timing, interactions, concerns)
- `recommendations[]` (priority, action, rationale, expected_impact)
- `ideal_routine` (description, schedule[])
- `experiments[]` (title, description, duration, measure, hypothesis)
- **Language**: auto-detects from day summaries, writes report in same language
- Config: `maxOutputTokens: 8192`, `temperature: 0.25`, `retries: 2`
- Cache key: `clarity_global_report`

### `generateReminders(entries, daySummaries)`
Scans last 14 days, extracts 3 types of items:
- `reminders[]`: tasks/follow-ups mentioned in entries (with `due_date` inferred from context)
- `answers[]`: answers to questions the user wondered about (with `search_query`)
- `suggestions[]`: proactive wellness suggestions (with `type`: positive|warning|info)
- Each reminder has: `text`, `source_date`, `due_date`, `source_excerpt`, `priority`, `action_hint`
- Auto-incremental update when new entries arrive, full re-analyze via header button
- Browser notifications for due/overdue reminders (deduped via `clarity_notif_sent`)
- Cache key: `clarity_reminders`, done state: `clarity_reminders_done`

### `generatePlaceholderHints(recentEntries)`
Context-aware input hints for Home. Returns array of `{text, source_date, source_time}`.
- Generates 6 short prompts based on recent entries + time of day + user context
- Cached in localStorage (`clarity_hints`, `clarity_hints_ts`), regenerated after new entry or >4h stale
- Clicking a hint with source scrolls to and highlights the referenced entry
- Config: `maxOutputTokens: 4096`, `temperature: 0.6`, `retries: 1`

### `analyzeEntry(entry, actionType, question)` (v0.3)
Per-entry AI analysis. Returns **prose** (not JSON).
- `actionType`: `'analyze'` (deep analysis) or `'ask'` (answer user question about entry)
- Injects user context, responds in same language as entry
- Config: `maxOutputTokens: 4096`, `temperature: 0.3`, `jsonMode: false`, `retries: 1`

### `findMissedReminders(entries, existingData)` (v0.3)
Re-scans all entries and finds reminders/suggestions/alerts/answers that were overlooked.
- Sends existing items to AI so it doesn't repeat them
- Returns same JSON format as `generateReminders` (only new items)
- Config: `maxOutputTokens: 8192`, `temperature: 0.2`, `retries: 1`

### `callGemini(prompt, options)`
- Retries with backoff on 429/5xx
- **Thinking model support**: filters out `thought: true` parts from response, picks actual text content
- **JSON extraction**: finds first `{` or `[` in response to skip any preamble text
- JSON repair for truncated responses (`repairJSON` function)
- **Handles array responses**: `if (Array.isArray(parsed)) parsed = parsed[0]` — critical fix
- **`jsonMode: false`** skips JSON.parse, returns raw prose text
- Routes through `/api/gemini` proxy when `VITE_GEMINI_API_KEY` is not set (production)
- Temperature: 0.2 for structured output

### Action Types
`medication | supplement | caffeine | substance | exercise | wellness | social | therapy | other`

### localStorage Keys
- `clarity_day_summaries` — day analyses cache
- `clarity_med_overrides` — per-day action toggles/additions
- `clarity_user_context` — user-written AI context (Profile page)
- `clarity_global_report` — cross-day AI report cache (Trends page)
- `clarity_reminders` — generated reminders cache
- `clarity_reminders_hash` — entries hash for staleness detection
- `clarity_reminders_done` — JSON array of completed reminder indices
- `clarity_reminders_seen` — hash of last seen reminders (for badge)
- `clarity_onboarding_analysis_hint_dismissed` — onboarding hint state
- `clarity_hints` — AI-generated input hint chips cache
- `clarity_hints_ts` — timestamp of last hint generation
- `clarity_reminders_processed_ids` — processed entry IDs for incremental reminders
- `clarity_notion_creds` — Notion credentials JSON (token, databaseId, databaseName, titleProperty). Also persisted in Supabase user_metadata for cross-device
- `clarity_notion_sync_map` — JSON map of clarity_id → notion_page_id (dedup tracker)
- `clarity_notif_sent` — dedup tracker for browser notifications (avoids repeat notifications same session)

## Notion Sync

### Architecture
- **Proxy**: `/api/notion.js` serverless function (Vercel) + dev middleware in `vite.config.js`
- **Frontend**: `src/lib/notion.js` — credential management, sync map, push/pull/cleanup functions
- **No Notion token on server** — token stored in user's localStorage, sent per-request to proxy

### Sync Behavior
- **Clarity → Notion**: automatic. Every new entry auto-pushes via `autoSyncEntry()` (fire-and-forget in `store.jsx`, 1.5s delay to ensure credentials are hydrated)
- **Notion → Clarity**: automatic on app load (once per session via `useRef`), plus manual pull in Settings
- **Dedup**: text-based (case-insensitive trim comparison) + sync map (clarity_id → notion_page_id) + within-pull dedup
- **Delete**: deleting entry from Clarity does NOT delete from Notion (Notion acts as backup)
- **Pull inserts directly via Supabase** (not `addEntry`) to avoid re-pushing pulled entries to Notion

### Database Mapping
- Entry text → title property (auto-detected, e.g. "Annotazione")
- Date/time → `page.created_time` (Notion's automatic timestamp, accurate since sync is real-time)
- No extra columns needed in Notion database

### Proxy Actions
| Action | What it does |
|--------|-------------|
| `test` | Validates token + database_id, returns DB title + title property name |
| `query` | Paginates all pages sorted by `created_time` desc |
| `push` | Creates pages with entry text in title property (batches of 10, 350ms rate limit) |
| `archive` | Soft-deletes a Notion page (recoverable for 30 days) |
| `update` | PATCH page properties |

## Design Decisions
- **Home = minimal AI** — entries, input, and AI hint chips above input (context-aware suggestions). All deep analysis lives in Trends/DayDetail/Reminders
- **Feed order = chat-style** — oldest at top, newest at bottom, input fixed at bottom
- **Day separators** in feed as glass pills (Today, Yesterday, or formatted date)
- **On-demand analysis only** — user clicks ↻ per day. Reminders auto-update incrementally on new entries + manual "Re-analyze" button for full refresh
- **Single API call per day** — summary + insight + actions together
- **Actions not "Substances"** — right column tracks everything wellness-relevant
- **Top bar simplified** — Profile (left), Clarity. (center), Settings (right)
- **Bottom bar** — Trends button (left), input bar (center), Reminders button (right) — liquid glass style
- **Glass morphism** — frosted glass cards, not flat/material design
- **User context everywhere** — Profile page context injected into all 3 AI functions
- **Multilingual AI** — reports and reminders written in the same language as user entries
- **Reminders** — tabbed UI (Reminders/Answers/Suggestions) with swipe navigation. Auto-incremental on new entries, "Re-analyze" button for full refresh. Due dates with browser notifications. All sections checkable
- **Page transitions** — opacity fade (no transform — `transform` breaks `position: fixed` on Safari)
- **iPhone safe areas** — `viewport-fit=cover` + `env(safe-area-inset-*)` for top bar, bottom input bar, and feed padding
- **Notion credentials cross-device** — stored in Supabase `user_metadata`, hydrated via `getUser()` (not just JWT session which can be stale)
- **Supabase as source of truth** — localStorage is cache, Supabase wins on load, fire-and-forget saves
- **Gemini proxy in production** — `/api/gemini` serverless function hides API key from client bundle
- **Landing page + SPA** — `index.html` = landing, `app.html` = React SPA, split during build via `vercel.json`

## Known Issues / TODO
- [x] ~~Trends page needs visual rebuild~~ — DONE in v0.2 (AnalysisReport)
- [x] ~~Per-entry AI actions~~ — DONE in v0.3 (EntryDetailModal: Analyze + Ask anything)
- [x] ~~Deploy to Vercel~~ — DONE in v0.3 (clarity-dusky.vercel.app)
- [x] ~~Supabase persistence for reports/reminders~~ — DONE in v0.3
- [x] ~~Onboarding accessible anytime~~ — DONE in v0.3 (HelpCircle icon in Layout top-right)
- [x] ~~Merge Profile + Settings~~ — DONE in v0.3 (single Settings page, gear icon left, ? icon right)
- [x] ~~Notion two-way sync~~ — DONE in v0.3 (auto-push on new entry, auto-pull on app load, manual push/pull/cleanup in Settings)
- [x] ~~Hint chips refresh button~~ — DONE in v0.3.1 (RefreshCw icon as first chip in tray)
- [x] ~~Page transitions~~ — DONE in v0.3.1 (opacity fade, no transform to preserve position:fixed)
- [x] ~~iPhone safe areas~~ — DONE in v0.3.1 (viewport-fit=cover, env() safe area insets)
- [x] ~~Landing page mobile fix~~ — DONE in v0.3.1 (nav logo size, hero height)
- [x] ~~Reminders auto-regeneration bug~~ — DONE in v0.3.1 (never auto-regenerate, user-triggered only)
- [x] ~~Notion credentials cross-device~~ — DONE in v0.3.1 (getUser() for fresh metadata)
- [x] ~~iOS input zoom~~ — DONE in v0.3.2 (font-size: 16px on all inputs)
- [x] ~~Reminders banner not clearing~~ — DONE in v0.3.2 (processedIds as React state)
- [x] ~~Notion edit sync~~ — DONE in v0.3.2 (autoUpdateNotionEntry on updateEntry)
- [x] ~~Landing page mobile~~ — DONE in v0.3.2 (media queries, responsive grid)
- [x] ~~Medical disclaimer~~ — DONE in v0.3.2 (AnalysisReport banner + landing footer)
- [x] ~~Onboarding redesign~~ — DONE in v0.3.2 (Liquid Glass bottom sheet, English text)
- [x] ~~Reminders tabbed UI~~ — DONE in v0.3.2 (swipe navigation, re-analyze button, due dates, browser notifications)
- [x] ~~Thinking model JSON fix~~ — DONE in v0.3.2 (filter thought parts, extract JSON from preamble)
- [ ] `entries_source_check` constraint only accepts 'manual' — should also accept 'import', 'notion'
- [ ] `user_reminders` table may not exist on Supabase — run migration SQL to create it for cross-device persistence
- [ ] Rate limiting for "Analyze all" — some days fail with 429
- [ ] Push notifications for reminders (requires service worker + VAPID keys — currently browser-only via Notification API)

## Repo Structure
```
clarity/
├── CLAUDE.md          ← you are here
├── package.json       ← root (type: module for Vercel serverless)
├── vercel.json        ← Vercel deployment config
├── index.html         ← landing page (copied to app/public/landing.html for build)
├── supabase_migration_v0.3.sql  ← DB migration for user_reports + user_reminders
├── api/
│   ├── gemini.js      ← serverless Gemini API proxy (hides API key)
│   └── notion.js      ← serverless Notion API proxy (CORS bypass, actions: test/query/push/archive/update)
├── app/
│   ├── .env           ← API keys (git-ignored)
│   ├── .env.example
│   ├── index.html     ← SPA entry point
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   └── landing.html  ← landing page (becomes index.html in build)
│   └── src/
│       ├── main.jsx
│       ├── App.jsx        ← routes
│       ├── index.css      ← all styles
│       ├── components/
│       │   ├── Layout.jsx
│       │   ├── EntryDetailModal.jsx  ← read-first modal with AI actions
│       │   ├── EmptyState.jsx
│       │   ├── ErrorBoundary.jsx
│       │   ├── Onboarding.jsx
│       │   └── trends/
│       │       ├── AnalysisReport.jsx
│       │       ├── WellnessHero.jsx
│       │       └── DetailedStats.jsx
│       ├── lib/
│       │   ├── gemini.js  ← AI logic
│       │   ├── notion.js  ← Notion sync logic
│       │   ├── store.jsx  ← state management + auto-sync
│       │   ├── constants.js
│       │   └── supabase.js
│       └── pages/
│           ├── Home.jsx
│           ├── DayDetail.jsx
│           ├── Trends.jsx
│           ├── Reminders.jsx
│           ├── Profile.jsx
│           ├── Import.jsx
│           ├── Settings.jsx
│           └── Login.jsx
```

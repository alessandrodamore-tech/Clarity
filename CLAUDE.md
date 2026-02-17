# CLAUDE.md — Clarity Project Context

## Mission & Why This Exists

Clarity is a **mental health self-tracking app** — you write freely about your day, and AI structures, analyzes, and finds patterns in your data.

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
Mental health self-tracking app. Write freely about your day, AI structures and analyzes it.

## Tech Stack
- **Frontend**: React 19 + Vite, no component library, no charting library — everything hand-built
- **Backend**: Supabase (auth, Postgres, RLS)
- **AI**: Google Gemini API (`gemini-3-pro-preview`) for per-day analysis + cross-day reports + smart reminders + smart hints
- **Styling**: Custom CSS with glass morphism design system (CSS variables, `className="glass"`)
- **No TypeScript** — plain JSX

## Run
```bash
cd app
cp .env.example .env  # fill in Supabase + Gemini keys
npm install
npx vite --host --port 5173
```

## Environment Variables
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_GEMINI_API_KEY=<gemini-api-key>
```

## Architecture

### Pages (src/pages/)
| File | What it does |
|------|-------------|
| `Home.jsx` | Main feed — continuous entries oldest→newest, fixed input bar at bottom (chat-style) with Trends/Reminders nav buttons flanking it, AI hint chips above input, send icon button |
| `DayDetail.jsx` | Full day view: AI insight card, entries (click to edit), AI-extracted actions with manual overrides |
| `Trends.jsx` | Orchestrator: WellnessHero (heatmap + stats), AnalysisReport (AI clinical report), DetailedStats (time distribution + day-of-week) |
| `Reminders.jsx` | Smart AI-generated reminders, alerts, answers, suggestions. Auto-generates when entries change. Checkbox persistence + archive |
| `Profile.jsx` | User info + AI context textarea. Context injected into ALL Gemini calls |
| `Import.jsx` | Import wizard: text/CSV/Notion export/paste, preview, dedup, batch insert |
| `Settings.jsx` | Cache management, Import link, About, Sign Out |
| `Login.jsx` | Auth (login/signup) with Supabase |

### Core Libraries (src/lib/)
| File | What it does |
|------|-------------|
| `gemini.js` | All AI logic: `callGemini()`, `extractDayData()`, `generateGlobalInsights()`, `generateReminders()`, `generatePlaceholderHints()`, `getUserContext()`, `loadCachedSummaries()`, `clearSummaryCache()`, `analyzeAllEntries()` |
| `store.jsx` | React context: auth state, entries CRUD, `useApp()` hook |
| `supabase.js` | Supabase client init |
| `constants.js` | Shared constants |

### Components (src/components/)
| File | What it does |
|------|-------------|
| `Layout.jsx` | Top bar: Profile (left), "Clarity." (center), Settings (right). Simplified — Trends/Reminders moved to Home bottom bar |
| `EditEntryModal.jsx` | Full-screen modal for editing entries (text, date, time) with delete option |
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
- `.bottom-nav-btn` class: liquid glass navigation buttons flanking input bar
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
Scans last 14 days, extracts 4 types of items:
- `reminders[]`: tasks/follow-ups mentioned in entries
- `answers[]`: answers to questions the user wondered about (with `search_query`)
- `suggestions[]`: proactive wellness suggestions (with `type`: routine|experiment|optimization|social)
- `alerts[]`: health/medication concerns (with `severity`: info|warning|urgent)
- Each item has: `title`, `detail`, `source_date`, `source_quote`, `action_hint`
- Auto-generates when entries hash changes
- Cache key: `clarity_reminders`, done state: `clarity_reminders_done`

### `generatePlaceholderHints(recentEntries)`
Context-aware input hints for Home. Returns array of `{text, source_date, source_time}`.
- Generates 6 short prompts based on recent entries + time of day + user context
- Cached in localStorage (`clarity_hints`, `clarity_hints_ts`), regenerated after new entry or >4h stale
- Clicking a hint with source scrolls to and highlights the referenced entry
- Config: `maxOutputTokens: 4096`, `temperature: 0.6`, `retries: 1`

### `callGemini(prompt, options)`
- Retries with backoff on 429/5xx
- JSON repair for truncated responses (`repairJSON` function)
- **Handles array responses**: `if (Array.isArray(parsed)) parsed = parsed[0]` — critical fix
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

## Design Decisions
- **Home = minimal AI** — entries, input, and AI hint chips above input (context-aware suggestions). All deep analysis lives in Trends/DayDetail/Reminders
- **Feed order = chat-style** — oldest at top, newest at bottom, input fixed at bottom
- **Day separators** in feed as glass pills (Today, Yesterday, or formatted date)
- **On-demand analysis only** — user clicks ↻ per day or "Analyze all" in Settings. Reminders auto-generate
- **Single API call per day** — summary + insight + actions together
- **Actions not "Substances"** — right column tracks everything wellness-relevant
- **Top bar simplified** — Profile (left), Clarity. (center), Settings (right)
- **Bottom bar** — Trends button (left), input bar (center), Reminders button (right) — liquid glass style
- **Glass morphism** — frosted glass cards, not flat/material design
- **User context everywhere** — Profile page context injected into all 3 AI functions
- **Multilingual AI** — reports and reminders written in the same language as user entries
- **Incremental reminders** — only new entries are processed, results merged with existing

## Known Issues / TODO
- [x] ~~Trends page needs visual rebuild~~ — DONE in v0.2 (AnalysisReport)
- [ ] **Per-entry AI actions** — tapping an entry should show AI options (analyze, extract reminders, summarize, etc.) — NEXT PRIORITY
- [ ] Notion sync not implemented (import only, no live sync)
- [ ] `entries_source_check` constraint only accepts 'manual' — should also accept 'import', 'notion'
- [ ] Mobile responsive needs more testing
- [ ] Rate limiting for "Analyze all" — some days fail with 429
- [ ] Deploy to Vercel (currently localhost only)
- [ ] Push notifications for reminders (currently in-app only)

## Repo Structure
```
clarity/
├── CLAUDE.md          ← you are here
├── vercel.json        ← Vercel deployment config
├── api/               ← serverless API functions
├── app/
│   ├── .env           ← API keys (git-ignored)
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx        ← routes
│       ├── index.css      ← all styles
│       ├── components/
│       │   ├── Layout.jsx
│       │   ├── EditEntryModal.jsx
│       │   ├── EmptyState.jsx
│       │   ├── ErrorBoundary.jsx
│       │   ├── Onboarding.jsx
│       │   └── trends/
│       │       ├── AnalysisReport.jsx
│       │       ├── WellnessHero.jsx
│       │       └── DetailedStats.jsx
│       ├── lib/
│       │   ├── gemini.js  ← AI logic
│       │   ├── store.jsx  ← state management
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
└── docs/              ← landing page (GitHub Pages)
```

# CLAUDE.md — Clarity Project Context

## What is Clarity?
Mental health self-tracking app. Write freely about your day, AI structures and analyzes it.
Built for personal use (Alex) but designed as a public product for a Nova SBE master's application.

## Tech Stack
- **Frontend**: React 19 + Vite, no component library, no charting library — everything hand-built
- **Backend**: Supabase (auth, Postgres, RLS)
- **AI**: Google Gemini API (`gemini-2.0-flash`) for per-day analysis
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
| `Home.jsx` | Main feed — continuous entries oldest→newest, fixed input bar at bottom (chat-style) |
| `DayDetail.jsx` | Full day view: AI insight card, entries (click to edit), AI-extracted actions with manual overrides |
| `Trends.jsx` | Wellness heatmap (GitHub-style), AI correlations/patterns, factor frequency bars |
| `Insights.jsx` | Cross-day AI analysis with `generateGlobalInsights()` |
| `Import.jsx` | Import wizard: text/CSV/Notion export/paste, preview, dedup, batch insert |
| `Settings.jsx` | Profile, Import link, About, Sign Out |
| `Login.jsx` | Auth (login/signup) with Supabase |
| `Factors.jsx` | (Legacy — redirects to /app/trends) |
| `Meds.jsx` | (Legacy — unused) |

### Core Libraries (src/lib/)
| File | What it does |
|------|-------------|
| `gemini.js` | All AI logic: `callGemini()`, `extractDayData()`, `generateGlobalInsights()`, `loadCachedSummaries()`, `clearSummaryCache()`, `analyzeAllEntries()` |
| `store.jsx` | React context: auth state, entries CRUD, `useApp()` hook |
| `supabase.js` | Supabase client init |

### Components (src/components/)
| File | What it does |
|------|-------------|
| `Layout.jsx` | Top bar: Insights (left), "Clarity." (center), Settings (right). Max width 960px |

### Styling (src/index.css)
- CSS variables: `--font-display`, `--navy`, `--amber`, `--text-muted`, `--text-light`, `--radius-lg`
- `.glass` class: frosted glass cards with `::before`/`::after` pseudo-elements for highlights
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
- **Current**: `gemini-2.0-flash` (fast, reliable for structured output)
- **DO NOT use** `gemini-2.5-flash` — it's a thinking model that truncates JSON
- **DO NOT add** `thinkingConfig: { thinkingBudget: 0 }` — causes 400 error
- `gemini-3-pro-preview` has quota issues (limit: 0), will switch back when available

### `extractDayData(entries, userId, cachedData, previousDays)`
Single API call per day → returns `{ summary, insight, actions, entriesHash }`
- `summary`: 1-2 sentence day summary
- `insight`: observations, cause-effect, comparison with previous days (NEVER null)
- `actions`: AI-extracted wellness-relevant actions (medications, exercise, caffeine, etc.)

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

## Design Decisions
- **Home = zero AI** — just entries and input. All analysis lives in Trends/Insights
- **Feed order = chat-style** — oldest at top, newest at bottom, input fixed at bottom
- **No day separators** in feed — date shown as small label for non-today entries
- **On-demand analysis only** — user clicks ↻ per day or "Analyze all" in Settings
- **Single API call per day** — summary + insight + actions together
- **Actions not "Substances"** — right column tracks everything wellness-relevant
- **Top bar, no bottom tabs** — Insights (left icon), Clarity. (center), Settings (right icon)
- **Glass morphism** — frosted glass cards, not flat/material design

## Known Issues / TODO
- [ ] Trends page needs visual rebuild (current heatmap/charts are basic)
- [ ] Notion sync not implemented (import only, no live sync)
- [ ] `entries_source_check` constraint only accepts 'manual' — should also accept 'import', 'notion'
- [ ] Mobile responsive needs more testing
- [ ] Onboarding flow for new users
- [ ] Rate limiting for "Analyze all" — some days fail with 429
- [ ] Deploy to Vercel (currently localhost only)

## Repo Structure
```
clarity/
├── CLAUDE.md          ← you are here
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
│       │   └── Layout.jsx
│       ├── lib/
│       │   ├── gemini.js  ← AI logic
│       │   ├── store.jsx  ← state management
│       │   └── supabase.js
│       └── pages/
│           ├── Home.jsx
│           ├── DayDetail.jsx
│           ├── Trends.jsx
│           ├── Insights.jsx
│           ├── Import.jsx
│           ├── Settings.jsx
│           └── Login.jsx
└── docs/              ← landing page (GitHub Pages)
```

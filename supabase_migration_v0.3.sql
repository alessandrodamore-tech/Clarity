-- Clarity v0.3 — Persist report & reminders to Supabase
-- Run this in your Supabase SQL Editor

-- ─── GLOBAL REPORTS (Trends page) ────────────────────────
CREATE TABLE IF NOT EXISTS user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  report_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports"
  ON user_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports"
  ON user_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports"
  ON user_reports FOR UPDATE
  USING (auth.uid() = user_id);

-- ─── USER REMINDERS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  reminders_data jsonb NOT NULL DEFAULT '{}',
  done_items jsonb NOT NULL DEFAULT '[]',
  processed_ids jsonb NOT NULL DEFAULT '[]',
  entries_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reminders"
  ON user_reminders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminders"
  ON user_reminders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminders"
  ON user_reminders FOR UPDATE
  USING (auth.uid() = user_id);

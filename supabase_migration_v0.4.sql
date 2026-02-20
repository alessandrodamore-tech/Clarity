-- Clarity v0.4 — Fix entries_source_check constraint
-- Run this in your Supabase SQL Editor
-- https://supabase.com/dashboard → SQL Editor

-- The current constraint only allows 'manual' as source.
-- This causes silent errors when importing from Notion or CSV ('notion', 'import').

-- Drop the old constraint
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_source_check;

-- Add updated constraint allowing all valid sources
ALTER TABLE entries ADD CONSTRAINT entries_source_check
  CHECK (source IN ('manual', 'import', 'notion'));

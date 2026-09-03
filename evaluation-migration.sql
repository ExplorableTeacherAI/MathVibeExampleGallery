-- One-time migration: the first schema version was applied before the
-- rater-based redesign (lesson_evaluations/lesson_comparisons lack rater_id,
-- rater_assignments lacks own_participant).
--
-- Run this ONCE in the Supabase SQL editor. It DROPS the three evaluation
-- tables (they hold no real data yet) and recreates them with the current
-- structure. Do NOT run this after real data collection has started.

drop table if exists public.lesson_evaluations;
drop table if exists public.lesson_comparisons;
drop table if exists public.rater_assignments;

create extension if not exists pgcrypto;

create table public.rater_assignments (
  id uuid primary key default gen_random_uuid(),
  rater_id text not null unique,           -- e.g. "R1" (given to the teacher)
  participants jsonb not null default '[]',-- e.g. [1,2,3] (participant numbers)
  own_participant integer,                 -- their own study-participant number,
                                           -- if the rater was a creator (never
                                           -- auto-assigned their own lessons)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lesson_evaluations (
  id uuid primary key default gen_random_uuid(),
  rater_id text not null,                  -- e.g. "R1" (see rater_assignments)
  participant_id text not null,            -- e.g. "C7" (whose lesson it is)
  condition text not null,                 -- "full" | "no-design" | "no-edits"
  lesson_label text not null,              -- blinded label shown: "A" | "B" | "C"
  lesson_url text not null,
  answers jsonb not null,                  -- {q13..q28}: 1–5
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rater_id, participant_id, condition)
);

create table public.lesson_comparisons (
  id uuid primary key default gen_random_uuid(),
  rater_id text not null,
  participant_id text not null,
  condition_order jsonb not null,          -- {"A": "full", "B": ...} blinding map
  answers jsonb not null,                  -- best_* picks (condition keys),
                                           -- preference_reason, general_feedback
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rater_id, participant_id)
);

alter table public.rater_assignments enable row level security;
alter table public.lesson_evaluations enable row level security;
alter table public.lesson_comparisons enable row level security;

create policy "anon manage rater_assignments"
  on public.rater_assignments for all
  to anon using (true) with check (true);

create policy "anon upsert lesson_evaluations"
  on public.lesson_evaluations for all
  to anon using (true) with check (true);

create policy "anon upsert lesson_comparisons"
  on public.lesson_comparisons for all
  to anon using (true) with check (true);

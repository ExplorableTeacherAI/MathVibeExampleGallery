-- Schema for the teacher lesson-evaluation page (evaluation.html).
-- Run once in the Supabase SQL editor of project oxjrjdtrijhksqeohyka.
--
-- Recruited raters (rater_id, configured in assignments.js) each evaluate the
-- lesson sets of several study participants; every lesson is rated by
-- RATINGS_PER_LESSON (2) raters.
--
-- Three tables:
--   rater_assignments  — one row per rater: which participants' lesson sets
--                        they evaluate. Managed from the dashboard.
--   lesson_evaluations — one row per (rater, participant, condition): the 16
--                        Likert answers for that lesson, upserted as they go.
--   lesson_comparisons — one row per (rater, participant): per-dimension
--                        comparison picks and free-text feedback for that set.

create extension if not exists pgcrypto;

create table if not exists public.rater_assignments (
  id uuid primary key default gen_random_uuid(),
  rater_id text not null unique,           -- e.g. "R1" (given to the teacher)
  participants jsonb not null default '[]',-- e.g. [1,2,3] (participant numbers)
  own_participant integer,                 -- their own study-participant number,
                                           -- if the rater was a creator (never
                                           -- auto-assigned their own lessons)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_evaluations (
  id uuid primary key default gen_random_uuid(),
  rater_id text not null,                  -- e.g. "R1" (see assignments.js)
  participant_id text not null,            -- e.g. "C7" (whose lesson it is)
  condition text not null,                 -- "full" | "no-design" | "no-edits"
  lesson_label text not null,              -- blinded label shown: "A" | "B" | "C"
  lesson_url text not null,
  answers jsonb not null,                  -- {pq1..4, mc1..4, vq1..4, ie1..4}: 1–5
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rater_id, participant_id, condition)
);

create table if not exists public.lesson_comparisons (
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

-- The pages use the public anon key, so anon needs insert + update (upsert).
drop policy if exists "anon manage rater_assignments" on public.rater_assignments;
create policy "anon manage rater_assignments"
  on public.rater_assignments for all
  to anon using (true) with check (true);

drop policy if exists "anon upsert lesson_evaluations" on public.lesson_evaluations;
create policy "anon upsert lesson_evaluations"
  on public.lesson_evaluations for all
  to anon using (true) with check (true);

drop policy if exists "anon upsert lesson_comparisons" on public.lesson_comparisons;
create policy "anon upsert lesson_comparisons"
  on public.lesson_comparisons for all
  to anon using (true) with check (true);

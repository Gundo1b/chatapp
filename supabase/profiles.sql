-- Run this in Supabase SQL Editor
-- It creates the profiles table used by app/index.tsx

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  gender text not null check (gender in ('Man', 'Woman', 'Non-binary')),
  age integer not null check (age >= 18 and age <= 100),
  pictures text[] not null check (cardinality(pictures) = 3),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Public can insert profiles" on public.profiles;
create policy "Public can insert profiles"
on public.profiles
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public can read profiles" on public.profiles;
create policy "Public can read profiles"
on public.profiles
for select
to anon, authenticated
using (true);

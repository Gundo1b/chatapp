-- Run this in Supabase SQL Editor
-- It creates the profiles table used by app/index.tsx

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  gender text not null check (gender in ('Man', 'Woman', 'Non-binary')),
  age integer not null check (age >= 18 and age <= 100),
  pictures text[] not null check (cardinality(pictures) = 3),
  password_hash text not null check (char_length(trim(password_hash)) >= 8),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_name_unique_idx
  on public.profiles (name);

alter table public.profiles
  add column if not exists password_hash text;

create or replace function public.hash_profile_password()
returns trigger
language plpgsql
as $$
begin
  if new.password_hash is null or char_length(trim(new.password_hash)) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;

  if new.password_hash not like '$2%' then
    new.password_hash := crypt(new.password_hash, gen_salt('bf'));
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_hash_password_trg on public.profiles;
create trigger profiles_hash_password_trg
before insert or update of password_hash on public.profiles
for each row
execute function public.hash_profile_password();

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

drop policy if exists "Public can update profiles" on public.profiles;
create policy "Public can update profiles"
on public.profiles
for update
to anon, authenticated
using (true)
with check (true);

-- Storage bucket for profile photos
insert into storage.buckets (id, name, public)
values ('profile-pictures', 'profile-pictures', true)
on conflict (id) do nothing;

drop policy if exists "Public can upload profile pictures" on storage.objects;
create policy "Public can upload profile pictures"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'profile-pictures');

drop policy if exists "Public can read profile pictures" on storage.objects;
create policy "Public can read profile pictures"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'profile-pictures');

-- Friend requests
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_name text not null references public.profiles(name) on delete cascade,
  receiver_name text not null references public.profiles(name) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (sender_name, receiver_name)
);

alter table public.friend_requests enable row level security;

drop policy if exists "Public can insert friend requests" on public.friend_requests;
create policy "Public can insert friend requests"
on public.friend_requests
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public can read friend requests" on public.friend_requests;
create policy "Public can read friend requests"
on public.friend_requests
for select
to anon, authenticated
using (true);

drop policy if exists "Public can update friend requests" on public.friend_requests;
create policy "Public can update friend requests"
on public.friend_requests
for update
to anon, authenticated
using (true)
with check (true);

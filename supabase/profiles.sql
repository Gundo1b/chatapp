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

-- Friend requests table used by app/dashboard.tsx invite and bell badge logic
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_name text not null check (char_length(trim(sender_name)) > 0),
  receiver_name text not null check (char_length(trim(receiver_name)) > 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_not_self check (lower(trim(sender_name)) <> lower(trim(receiver_name)))
);

create unique index if not exists friend_requests_sender_receiver_unique_idx
  on public.friend_requests (sender_name, receiver_name);

create index if not exists friend_requests_receiver_status_idx
  on public.friend_requests (receiver_name, status);

create or replace function public.touch_friend_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists friend_requests_touch_updated_at_trg on public.friend_requests;
create trigger friend_requests_touch_updated_at_trg
before update on public.friend_requests
for each row
execute function public.touch_friend_requests_updated_at();

alter table public.friend_requests enable row level security;

drop policy if exists "Public can read friend requests" on public.friend_requests;
create policy "Public can read friend requests"
on public.friend_requests
for select
to anon, authenticated
using (true);

drop policy if exists "Public can insert friend requests" on public.friend_requests;
create policy "Public can insert friend requests"
on public.friend_requests
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public can update friend requests" on public.friend_requests;
create policy "Public can update friend requests"
on public.friend_requests
for update
to anon, authenticated
using (true)
with check (true);

-- Chat messages table used by app/dashboard.tsx
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_name text not null check (char_length(trim(sender_name)) > 0),
  receiver_name text not null check (char_length(trim(receiver_name)) > 0),
  message_text text not null check (char_length(trim(message_text)) > 0),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.chat_messages
  add column if not exists read_at timestamptz;

create index if not exists chat_messages_pair_created_idx
  on public.chat_messages (sender_name, receiver_name, created_at);

create index if not exists chat_messages_receiver_read_idx
  on public.chat_messages (receiver_name, read_at);

create or replace function public.ensure_chat_participants_are_friends()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (lower(trim(fr.sender_name)) = lower(trim(new.sender_name))
         and lower(trim(fr.receiver_name)) = lower(trim(new.receiver_name)))
        or
        (lower(trim(fr.sender_name)) = lower(trim(new.receiver_name))
         and lower(trim(fr.receiver_name)) = lower(trim(new.sender_name)))
      )
  ) then
    raise exception 'Only accepted friends can exchange messages';
  end if;

  return new;
end;
$$;

drop trigger if exists chat_messages_friends_only_trg on public.chat_messages;
create trigger chat_messages_friends_only_trg
before insert on public.chat_messages
for each row
execute function public.ensure_chat_participants_are_friends();

alter table public.chat_messages enable row level security;

drop policy if exists "Public can read chat messages" on public.chat_messages;
create policy "Public can read chat messages"
on public.chat_messages
for select
to anon, authenticated
using (true);

drop policy if exists "Public can insert chat messages" on public.chat_messages;
create policy "Public can insert chat messages"
on public.chat_messages
for insert
to anon, authenticated
with check (true);

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Table for sources
create table public.sources (
  id text primary key,
  name text not null,
  color text not null,
  paused boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Table for routes
create table public.routes (
  id text primary key,
  source_id text references public.sources(id) on delete cascade,
  name text not null,
  url text not null,
  fields text[] not null default '{}'::text[],
  paused boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Table for user profiles
create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password text not null,
  reveal_payout boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insert default admin account (email: admin@webstersolutions.com, password: Abdulrehman)
insert into public.user_profiles (email, password, reveal_payout, is_admin)
values ('admin@webstersolutions.com', 'Abdulrehman', true, true)
on conflict (email) do nothing;

-- 4. Table for settings
create table public.settings (
  key text primary key,
  value jsonb not null
);

-- Insert default settings
insert into public.settings (key, value) values ('payoutRangeSize', '40') on conflict do nothing;

-- Disable Row Level Security (RLS) on tables for direct backend integration
alter table public.sources disable row level security;
alter table public.routes disable row level security;
alter table public.user_profiles disable row level security;
alter table public.settings disable row level security;

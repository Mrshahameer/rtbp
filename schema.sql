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
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  reveal_payout boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Table for settings
create table public.settings (
  key text primary key,
  value jsonb not null
);

-- Insert default settings
insert into public.settings (key, value) values ('payoutRangeSize', '40') on conflict do nothing;

-- 5. Trigger to automatically create profile on sign up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, is_admin, reveal_payout)
  values (
    new.id,
    new.email,
    -- Make the very first user an admin automatically, subsequent users are normal agents
    not exists (select 1 from public.user_profiles),
    false
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enable Row Level Security (RLS) on tables
alter table public.sources enable row level security;
alter table public.routes enable row level security;
alter table public.user_profiles enable row level security;
alter table public.settings enable row level security;

-- RLS Policies for Sources
create policy "Allow authenticated users to read sources"
  on public.sources for select to authenticated using (true);

create policy "Allow admins to insert sources"
  on public.sources for insert to authenticated
  using (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true));

create policy "Allow admins to update sources"
  on public.sources for update to authenticated
  using (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true));

create policy "Allow admins to delete sources"
  on public.sources for delete to authenticated
  using (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true));

-- RLS Policies for Routes
create policy "Allow authenticated users to read routes"
  on public.routes for select to authenticated using (true);

create policy "Allow admins to insert routes"
  on public.routes for insert to authenticated
  using (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true));

create policy "Allow admins to update routes"
  on public.routes for update to authenticated
  using (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true));

create policy "Allow admins to delete routes"
  on public.routes for delete to authenticated
  using (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true));

-- RLS Policies for User Profiles
create policy "Allow authenticated users to read profiles"
  on public.user_profiles for select to authenticated using (true);

create policy "Allow admins to update profiles"
  on public.user_profiles for update to authenticated
  using (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true));

-- RLS Policies for Settings
create policy "Allow authenticated users to read settings"
  on public.settings for select to authenticated using (true);

create policy "Allow admins to update settings"
  on public.settings for update to authenticated
  using (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true));

-- DawgShop 0001: student profiles and the @uga.edu rule (issue #3)
--
-- How to run: Supabase dashboard -> SQL Editor -> New query -> paste this
-- whole file -> Run. Run it once per project.

-- ---------------------------------------------------------------------------
-- 1. Profiles: one row per student, created on the /welcome screen.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  name        text not null,
  pickup_area text null,          -- optional dorm or apartment, e.g. 'Russell Hall'
  created_at  timestamptz not null default now(),

  constraint profiles_email_is_uga check (lower(email) like '%@uga.edu'),
  constraint profiles_name_length check (char_length(name) between 1 and 50)
);

comment on table public.profiles is 'DawgShop student profiles. One row per verified @uga.edu account.';

-- ---------------------------------------------------------------------------
-- 2. Row Level Security: each student can only see and change their own row.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

grant select, insert, update on public.profiles to authenticated;

create policy "Students can read their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- The email saved in the profile must be the email they actually signed in with.
create policy "Students can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id and email = (auth.jwt() ->> 'email'));

create policy "Students can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and email = (auth.jwt() ->> 'email'));

-- NOTE: Listings (#5) and messaging will need other students' names to be
-- readable (e.g. "Sold by Ava"). That read policy is intentionally left for a
-- later issue. Until then, a student can only read their own profile.

-- ---------------------------------------------------------------------------
-- 3. Block non-UGA accounts in the database itself.
--
-- The app already checks for @uga.edu, but someone could call the Supabase
-- Auth API directly with the public anon key. This trigger runs inside the
-- database whenever an account is created (or its email is changed) and
-- rejects any email that doesn't end in @uga.edu, so it can't be bypassed.
-- Supabase reports the failure to the caller as "Database error saving new user".
-- ---------------------------------------------------------------------------
create or replace function public.enforce_uga_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) not like '%@uga.edu' then
    raise exception 'DawgShop is only for UGA students. Use your @uga.edu email.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Only the trigger should ever call this function.
revoke execute on function public.enforce_uga_email() from public, anon, authenticated;

create trigger enforce_uga_email
  before insert or update of email on auth.users
  for each row
  execute function public.enforce_uga_email();

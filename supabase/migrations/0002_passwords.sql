-- DawgShop 0002: passwords (issue #3)
--
-- How to run: Supabase dashboard -> SQL Editor -> New query -> paste this
-- whole file -> Run. Run it ONCE per project, after 0001_profiles.sql.
-- (Part 3 is a one-time data fix. Read the warning there before re-running.)
--
-- How sign-in works after this migration:
--   * Returning students sign in with their @uga.edu email and a password.
--   * The emailed code is still the ONLY way to create an account (it proves
--     the student owns the inbox) and the way to reset a forgotten password.
--   * New students choose their password on the /welcome screen.
--
-- Background you need to understand this file:
--   Supabase Auth keeps accounts in auth.users. The password is stored as a
--   bcrypt hash in auth.users.encrypted_password. When signInWithOtp (the
--   emailed code) creates a brand-new account, Supabase quietly gives it a
--   RANDOM password nobody knows, so that column is NOT empty even though the
--   student never chose a password. That's why the app can't just ask
--   "is encrypted_password empty?" without the trigger in part 2 below.

-- ---------------------------------------------------------------------------
-- 1. has_password(): does the signed-in student have a password?
--
-- The app calls this with supabase.rpc('has_password') right after a code
-- sign-in. If the answer is false, the student is sent to /set-password.
--
-- Why "security definer": students can't read auth.users directly (and
-- shouldn't, since it holds everyone's password hashes). A security definer
-- function runs with the permissions of its owner, so it CAN read
-- auth.users. It only ever returns true/false for the CALLER's own row
-- (auth.uid()), never a hash and never anyone else's account.
--
-- Why "set search_path = ''": security definer functions must not trust the
-- caller's search_path, or someone could trick them into using a look-alike
-- table. With an empty search_path, every name must be fully written out
-- (auth.users, auth.uid()), so there's nothing to trick.
--
-- Why "stable": it only reads data and returns the same answer within one
-- query, which lets Postgres optimize it.
-- ---------------------------------------------------------------------------
create or replace function public.has_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Missing row, null, and '' all count as "no password".
  select coalesce(
    (select u.encrypted_password from auth.users as u where u.id = auth.uid()),
    ''
  ) <> '';
$$;

comment on function public.has_password() is
  'True if the calling user has a password they chose. Used by the app after a code sign-in.';

-- Supabase grants new functions to everyone by default. Lock it down so only
-- signed-in students can call it. (Signed-out visitors, the "anon" role, have
-- no auth.uid(), so the answer would be meaningless for them anyway.)
revoke execute on function public.has_password() from public, anon;
grant execute on function public.has_password() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Clear the password the moment a student first verifies their email.
--
-- This trigger runs inside the database just before any change to a row in
-- auth.users. It does something only at one moment: when email_confirmed_at
-- goes from empty (never verified) to set (the student just typed the code
-- from their @uga.edu inbox). At that moment it wipes encrypted_password.
--
-- What this achieves:
--   a. Code-created accounts become truly passwordless. The random password
--      Supabase made up is thrown away, so has_password() correctly says
--      false and the student is asked to choose a real one on /welcome.
--   b. It defeats "pre-account hijacking". Without it, someone could call
--      Supabase's signUp API directly (with the public anon key) using ANOTHER
--      student's @uga.edu address and a password the attacker chose, before
--      that student ever joined. When the real student later verified their
--      email with a code, the attacker's password would still work on the
--      account. With this trigger, any password set before verification is
--      wiped when the real owner verifies.
--
-- The DawgShop app never calls supabase.auth.signUp; accounts are only made
-- by the emailed code. So no legitimate password is ever set before
-- verification, and wiping it at verification never loses a real password.
--
-- We set '' (empty string), not null, because Supabase Auth's Go code reads
-- this column as a string. Supabase treats '' as "no password" and will
-- reject any password sign-in for that account until one is set.
--
-- The trigger is named "enforce_zz_..." so it sorts AFTER enforce_uga_email
-- (from 0001). Postgres runs triggers of the same kind in alphabetical order,
-- so the @uga.edu check always runs first.
--
-- IMPORTANT: this depends on how Supabase Auth stores passwords for
-- code-created accounts (a random hash at creation, email_confirmed_at set on
-- first verification). If Supabase ever changes that, re-check this trigger:
-- create a test account with a code, then confirm has_password() is false
-- and that setting a password on /welcome still works.
-- ---------------------------------------------------------------------------
create or replace function public.clear_password_on_first_verify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only on the first verification: before, never confirmed; now, confirmed.
  -- Later password changes (on /welcome or /set-password) happen after this,
  -- when old.email_confirmed_at is already set, so they are left alone.
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;

-- Only the trigger should ever call this function.
revoke execute on function public.clear_password_on_first_verify() from public, anon, authenticated;

drop trigger if exists enforce_zz_clear_password_on_first_verify on auth.users;
create trigger enforce_zz_clear_password_on_first_verify
  before update on auth.users
  for each row
  execute function public.clear_password_on_first_verify();

-- ---------------------------------------------------------------------------
-- 3. ONE-TIME DATA FIX for accounts that already exist.
--
-- WARNING: Only safe to run before any student has set a real password.
-- Do not re-run later. Running this again would erase every student's
-- password, and they would all have to reset it with a code.
--
-- Why it's needed: accounts created before this migration were verified
-- before the trigger in part 2 existed, so they still hold Supabase's random
-- password. No student has chosen a real password yet (this feature is new),
-- so every existing hash is a random one. Clearing them makes has_password()
-- return false, and those students are sent to /set-password the next time
-- they sign in with a code.
-- ---------------------------------------------------------------------------
update auth.users
set encrypted_password = ''
where coalesce(encrypted_password, '') <> '';

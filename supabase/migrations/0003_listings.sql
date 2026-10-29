-- DawgShop 0003: listings, listing photos, and live updates (issues #4, #5, #7)
--
-- How to run: Supabase dashboard -> SQL Editor -> New query -> paste this
-- whole file -> Run. Run it once per project, after 0001 and 0002.
--
-- What this file sets up:
--   1. public.listings, the table of things students are selling
--   2. Row Level Security (RLS) rules for listings: who can see and change what
--   3. Profiles become readable by other students (names only, never emails)
--   4. A PRIVATE storage bucket for listing photos, plus its rules
--   5. Realtime, so the Browse and Move-in feeds update live
--
-- A reminder about RLS: the app talks to Supabase with the public "anon" key,
-- which anyone can find in the browser. RLS is what actually keeps data safe.
-- Every rule below runs inside the database, so it can't be skipped by
-- someone calling the Supabase API directly.

-- ---------------------------------------------------------------------------
-- 1. The listings table
-- ---------------------------------------------------------------------------
create table public.listings (
  id             uuid primary key default gen_random_uuid(),

  -- Who is selling it. "default auth.uid()" fills in the signed-in student
  -- automatically. If their profile is deleted, their listings go with it.
  seller_id      uuid not null default auth.uid()
                 references public.profiles (id) on delete cascade,

  title          text not null,
  description    text not null default '',
  price          integer not null,           -- whole dollars; 0 means free
  category       text not null,
  condition      text not null,
  pickup_area    text not null,              -- e.g. 'Russell Hall' (the app checks it against lib/areas.ts)
  course         text null,                  -- e.g. 'ACCT 2101', only for textbooks
  available_from date null,                  -- move-in listings: the date it can be picked up
  status         text not null default 'active',

  -- Storage paths of the photos, like '<seller id>/<random id>.jpg'.
  -- The first one is the cover photo shown on the Browse grid.
  photos         text[] not null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- These checks repeat the app's own validation (lib/listings.ts) so bad
  -- data can't get in even if someone skips the app.
  constraint listings_title_length check (char_length(btrim(title)) between 1 and 70),
  constraint listings_description_length check (char_length(description) <= 2000),
  constraint listings_price_range check (price between 0 and 10000),
  constraint listings_category_valid check (
    category in ('Furniture', 'Dorm essentials', 'Electronics', 'Textbooks', 'Clothes', 'Free', 'Other')
  ),
  constraint listings_condition_valid check (condition in ('New', 'Like new', 'Used')),
  constraint listings_pickup_area_length check (char_length(btrim(pickup_area)) between 1 and 60),
  constraint listings_course_length check (course is null or char_length(course) <= 20),
  -- active = for sale, sold = sold (seller still sees it), hidden = "Unlisted"
  constraint listings_status_valid check (status in ('active', 'sold', 'hidden')),
  -- At least 1 photo and at most 5.
  constraint listings_photo_count check (cardinality(photos) between 1 and 5)
);

comment on table public.listings is 'Items DawgShop students are selling. Visible to signed-in students while active.';

-- Keep updated_at current: this trigger runs before every UPDATE and stamps
-- the row with the time of the change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Only the trigger should call this function.
revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger listings_set_updated_at
  before update on public.listings
  for each row
  execute function public.set_updated_at();

-- Indexes make the common lookups fast:
--   * the Browse feed: "active listings, newest first"
--   * the Me page: "everything this seller posted"
create index listings_status_created_at_idx on public.listings (status, created_at desc);
create index listings_seller_id_idx on public.listings (seller_id);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security for listings
--
-- Only signed-in students ("authenticated") get any access. Signed-out
-- visitors ("anon") get nothing, because no policy mentions them.
-- ---------------------------------------------------------------------------
alter table public.listings enable row level security;

grant select, insert, update, delete on public.listings to authenticated;

-- Everyone signed in can see listings that are for sale. Sellers can also see
-- their own sold and unlisted items (for the Me page). Nobody else can, which
-- is why a sold item disappears from Browse the moment it's marked sold.
create policy "Students can read active listings and their own"
  on public.listings for select
  to authenticated
  using (status = 'active' or seller_id = auth.uid());

-- You can only post a listing as yourself.
create policy "Students can create their own listings"
  on public.listings for insert
  to authenticated
  with check (seller_id = auth.uid());

-- You can only change your own listings, and you can't hand one to someone
-- else ("with check" also applies to the row after the change).
create policy "Students can update their own listings"
  on public.listings for update
  to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

create policy "Students can delete their own listings"
  on public.listings for delete
  to authenticated
  using (seller_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Let students see each other's names (but never emails)
--
-- Listings show "Sold by Ava", so a student needs to read OTHER students'
-- profiles. Until now (0001) a student could only read their own row.
--
-- The catch: profiles also has an email column, and we don't want anyone to
-- be able to download every student's email address. RLS decides which ROWS
-- you can see; column privileges decide which COLUMNS. So we:
--   a. add a policy that lets signed-in students read every profile row, and
--   b. take away "select" on the whole table and give it back for every
--      column EXCEPT email.
-- After this, "select email from profiles" fails with "permission denied"
-- for everyone using the app's keys, even for your own row. The app uses
-- the email from your sign-in session instead (lib/auth.ts).
--
-- The insert and update privileges from 0001 are unchanged, so the /welcome
-- screen can still save a profile (including its email) as before.
-- ---------------------------------------------------------------------------
create policy "Signed-in students can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

revoke select on public.profiles from authenticated;
grant select (id, name, pickup_area, created_at) on public.profiles to authenticated;

-- Signed-out visitors have no policy on profiles, so RLS already returns no
-- rows to them. Removing their select privilege too is a second lock.
revoke select on public.profiles from anon;

-- ---------------------------------------------------------------------------
-- 4. Listing photos: a PRIVATE storage bucket
--
-- "public = false" means there are no permanent public links. The app asks
-- Supabase for signed URLs that expire after an hour, and only signed-in
-- students can get them (the select policy below). Limits: 5 MB per file,
-- JPEG/PNG/WebP only. (The app shrinks photos to JPEG before uploading.)
--
-- Files are stored as '<student id>/<random id>.jpg'. The first folder in the
-- path is the uploader's user id, which is how the rules below know whose
-- photo it is. storage.foldername('abc/x.jpg') returns {'abc'}.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Any signed-in student can view listing photos.
create policy "Signed-in students can view listing photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'listing-photos');

-- You can only upload into your own folder.
create policy "Students can upload listing photos to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- You can only replace or delete photos in your own folder.
create policy "Students can update their own listing photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Students can delete their own listing photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 5. Realtime: tell open Browse and Move-in pages when listings change
--
-- Supabase Realtime watches tables in the "supabase_realtime" publication and
-- pushes changes to browsers that subscribed. The app's LiveRefresh component
-- subscribes and re-renders the page when something changes.
--
-- Realtime respects RLS for each subscriber: a student only gets a change if
-- the select policy above lets them see the new row. So no one is ever sent
-- someone else's unlisted item. One side effect: when a listing is marked
-- sold or unlisted, other students CAN'T see the new row, so they don't get
-- that change. The app covers this by sending a small "listings changed"
-- broadcast after a seller marks something sold, unlists, or deletes it.
--
-- The DO block only adds the table if it isn't already in the publication,
-- so re-running this part doesn't error.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'listings'
  ) then
    alter publication supabase_realtime add table public.listings;
  end if;
end;
$$;

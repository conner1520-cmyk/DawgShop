-- DawgShop 0004: buyer-seller messaging (issue #6)
--
-- How to run: Supabase dashboard -> SQL Editor -> New query -> paste this
-- whole file -> Run. Run it once per project, after 0001, 0002 and 0003.
--
-- What this file sets up:
--   1. public.conversations: one chat per buyer per listing
--   2. public.messages: the messages inside each chat
--   3. Row Level Security (RLS): only the two people in a chat can see it
--   4. Database functions the app calls to start a chat, mark it read, and
--      count unread chats, plus a trigger that keeps each chat's
--      "last message" summary up to date
--   5. Realtime, so new messages show up without refreshing
--
-- Messaging is plain text only. There are no offers, no accept/decline
-- buttons, and nothing in a chat ever changes the listing. Students agree on
-- price and a meetup spot in their own words.
--
-- Reminder: the app talks to Supabase with the public "anon" key, which
-- anyone can find in the browser. RLS is what keeps chats private. Every
-- rule below runs inside the database, so it can't be skipped by someone
-- calling the Supabase API directly.

-- ---------------------------------------------------------------------------
-- 1. Conversations: one row per buyer per listing
-- ---------------------------------------------------------------------------
create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),

  -- The listing this chat is about. If the seller deletes the listing, this
  -- becomes null ("on delete set null") but the chat itself stays.
  listing_id           uuid null,

  -- Snapshots taken when the chat starts. A buyer can't read a listing once
  -- it's sold, unlisted or deleted (0003's RLS), so the chat keeps its own
  -- copy of the title and the cover photo's storage path to stay readable.
  listing_title        text not null,
  listing_photo        text null,

  -- The two people in the chat. The seller always comes from the listing
  -- itself (see start_conversation below), never from what the browser sends.
  buyer_id             uuid not null,
  seller_id            uuid not null,

  created_at           timestamptz not null default now(),

  -- A summary of the newest message, kept up to date by a trigger (section
  -- 4), so the inbox doesn't have to read every message to draw its rows.
  -- Null until someone sends the first message.
  last_message_at      timestamptz null,
  last_message_sender  uuid null,
  last_message_preview text null,          -- the first 120 characters

  -- When each person last opened the chat. A chat is "unread" for you when
  -- the newest message is from the other person and is newer than this.
  buyer_last_read_at   timestamptz null,
  seller_last_read_at  timestamptz null,

  -- Named foreign keys, so the app can say exactly which one to follow when
  -- it looks up the buyer's or the seller's name in profiles.
  constraint conversations_listing_id_fkey
    foreign key (listing_id) references public.listings (id) on delete set null,
  constraint conversations_buyer_id_fkey
    foreign key (buyer_id) references public.profiles (id) on delete cascade,
  constraint conversations_seller_id_fkey
    foreign key (seller_id) references public.profiles (id) on delete cascade,

  -- One chat per buyer per listing. Tapping "Message seller" again reopens
  -- the same chat instead of starting a new one.
  constraint conversations_one_per_buyer unique (listing_id, buyer_id),

  -- You can't message yourself about your own listing.
  constraint conversations_two_people check (buyer_id <> seller_id)
);

comment on table public.conversations is 'DawgShop chats: one per buyer per listing. Only the buyer and seller can read it.';

-- The inbox asks "my chats, newest message first", once as a buyer and once
-- as a seller. These indexes make both lookups fast.
create index conversations_buyer_last_message_idx
  on public.conversations (buyer_id, last_message_at desc);
create index conversations_seller_last_message_idx
  on public.conversations (seller_id, last_message_at desc);

-- ---------------------------------------------------------------------------
-- 2. Messages
-- ---------------------------------------------------------------------------
create table public.messages (
  id              uuid primary key default gen_random_uuid(),

  -- Which chat it belongs to. Deleting a chat deletes its messages.
  conversation_id uuid not null
                  references public.conversations (id) on delete cascade,

  -- Who sent it. "default auth.uid()" fills in the signed-in student, and
  -- the insert rule below makes sure nobody can send as someone else.
  sender_id       uuid not null default auth.uid()
                  references public.profiles (id) on delete cascade,

  body            text not null,
  created_at      timestamptz not null default now(),

  -- These repeat the app's own check (lib/messages.ts, validateMessage):
  -- not blank, and at most 2,000 characters. btrim(body, E' \t\r\n') strips
  -- spaces, tabs and line breaks from both ends, so a message that is only
  -- whitespace is rejected. The second check caps the stored text itself
  -- (the app trims messages before saving them).
  constraint messages_body_not_blank check (char_length(btrim(body, E' \t\r\n')) between 1 and 2000),
  constraint messages_body_length check (char_length(body) <= 2000)
);

comment on table public.messages is 'Plain-text DawgShop messages. Only the two people in the chat can read them.';

-- A thread loads "this chat's messages in time order".
create index messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
--
-- Only signed-in students ("authenticated") get any access, and only to
-- chats they are part of. Signed-out visitors ("anon") get nothing.
--
-- Supabase gives new tables broad privileges by default, so we first take
-- them all away and then grant back only what the app needs:
--   * conversations: read only. Starting a chat, marking it read, and the
--     "last message" summary all go through the functions in section 4,
--     which check the rules themselves. Students can't insert, update or
--     delete chat rows directly (so nobody can, say, change who the seller
--     is or mark the other person's side as read).
--   * messages: read and send. No editing or deleting messages.
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations from anon, authenticated;
revoke all on public.messages from anon, authenticated;

grant select on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

-- You can see a chat only if you're its buyer or its seller.
create policy "Participants can read their conversations"
  on public.conversations for select
  to authenticated
  using (auth.uid() in (buyer_id, seller_id));

-- You can read a message only if you're in its chat.
create policy "Participants can read messages in their conversations"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and auth.uid() in (c.buyer_id, c.seller_id)
    )
  );

-- You can send a message only as yourself, and only into a chat you're in.
create policy "Participants can send messages in their conversations"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and auth.uid() in (c.buyer_id, c.seller_id)
    )
  );

-- No update or delete policies on purpose: messages can't be edited or
-- removed through the API.

-- ---------------------------------------------------------------------------
-- 4. Functions
--
-- "security definer" means the function runs with the database owner's
-- rights, so it can write to conversations even though students can't.
-- That's safe only because each function checks who is calling (auth.uid())
-- and decides everything else itself. "set search_path = ''" plus fully
-- written-out names (public.listings, not just listings) stops anyone from
-- tricking the function into using a look-alike table.
--
-- Only signed-in students may call them: execute is taken away from
-- everyone ("public") and from signed-out visitors ("anon"), then given to
-- "authenticated".
-- ---------------------------------------------------------------------------

-- 4a. Start (or reopen) a chat about a listing. Returns the chat's id.
--     The app calls this when a buyer taps "Message seller".
create or replace function public.start_conversation(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_listing record;
  v_id      uuid;
begin
  -- Must be signed in...
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  -- ...and have finished setting up a profile (name) on /welcome.
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'NO_PROFILE';
  end if;

  -- The listing must exist and still be for sale.
  select l.id, l.seller_id, l.title, l.photos, l.status
    into v_listing
    from public.listings l
   where l.id = p_listing_id;

  if not found or v_listing.status <> 'active' then
    raise exception 'LISTING_UNAVAILABLE';
  end if;

  -- You can't message yourself about your own listing.
  if v_listing.seller_id = v_uid then
    raise exception 'OWN_LISTING';
  end if;

  -- Already chatting about this listing? Reopen that chat.
  select c.id
    into v_id
    from public.conversations c
   where c.listing_id = p_listing_id
     and c.buyer_id = v_uid;

  if v_id is not null then
    return v_id;
  end if;

  -- Start a new chat. The seller comes from the listing row, never from the
  -- caller. photos[1] is the cover photo (Postgres arrays start at 1).
  -- "on conflict do nothing" covers a double tap that starts two chats at
  -- the same moment: the second one finds the first below.
  insert into public.conversations (listing_id, listing_title, listing_photo, buyer_id, seller_id)
  values (v_listing.id, v_listing.title, v_listing.photos[1], v_uid, v_listing.seller_id)
  on conflict (listing_id, buyer_id) do nothing
  returning id into v_id;

  if v_id is null then
    select c.id
      into v_id
      from public.conversations c
     where c.listing_id = p_listing_id
       and c.buyer_id = v_uid;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.start_conversation(uuid) from public, anon;
grant execute on function public.start_conversation(uuid) to authenticated;

-- 4b. Mark a chat as read for whoever is calling: stamps the caller's own
--     side (buyer_last_read_at or seller_last_read_at) with the time now.
--     Does nothing if the caller isn't in the chat, or if there's nothing
--     new to read (which also avoids sending pointless Realtime updates).
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  update public.conversations c
     set buyer_last_read_at  = case when c.buyer_id  = v_uid then now() else c.buyer_last_read_at  end,
         seller_last_read_at = case when c.seller_id = v_uid then now() else c.seller_last_read_at end
   where c.id = p_conversation_id
     and v_uid in (c.buyer_id, c.seller_id)
     and c.last_message_at is not null
     and (
       (c.buyer_id  = v_uid and (c.buyer_last_read_at  is null or c.buyer_last_read_at  < c.last_message_at))
       or
       (c.seller_id = v_uid and (c.seller_last_read_at is null or c.seller_last_read_at < c.last_message_at))
     );
end;
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- 4c. How many of the caller's chats have a message they haven't read yet.
--     The app shows a red dot on the Messages tab when this is above 0.
--     A chat counts when its newest message is from the OTHER person and is
--     newer than the caller's last_read_at (or they've never opened it).
create or replace function public.unread_conversation_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.conversations c
   where c.last_message_at is not null
     and c.last_message_sender <> auth.uid()
     and (
       (c.buyer_id  = auth.uid() and (c.buyer_last_read_at  is null or c.last_message_at > c.buyer_last_read_at))
       or
       (c.seller_id = auth.uid() and (c.seller_last_read_at is null or c.last_message_at > c.seller_last_read_at))
     );
$$;

revoke execute on function public.unread_conversation_count() from public, anon;
grant execute on function public.unread_conversation_count() to authenticated;

-- 4d. After every new message, update its chat's summary:
--       * last_message_at / _sender / _preview, so the inbox shows it
--       * the SENDER's own last_read_at, since your own message is never
--         unread to you
--     The "newer" checks keep the summary on the newest message even if two
--     messages are saved at almost the same moment and finish out of order.
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
     set last_message_at      = case when c.last_message_at is null or new.created_at >= c.last_message_at
                                     then new.created_at else c.last_message_at end,
         last_message_sender  = case when c.last_message_at is null or new.created_at >= c.last_message_at
                                     then new.sender_id else c.last_message_sender end,
         last_message_preview = case when c.last_message_at is null or new.created_at >= c.last_message_at
                                     then left(new.body, 120) else c.last_message_preview end,
         buyer_last_read_at   = case when c.buyer_id  = new.sender_id then now() else c.buyer_last_read_at  end,
         seller_last_read_at  = case when c.seller_id = new.sender_id then now() else c.seller_last_read_at end
   where c.id = new.conversation_id;
  return null;  -- "after" triggers ignore the return value
end;
$$;

-- Only the trigger should call this function.
revoke execute on function public.messages_after_insert() from public, anon, authenticated;

create trigger messages_update_conversation
  after insert on public.messages
  for each row
  execute function public.messages_after_insert();

-- ---------------------------------------------------------------------------
-- 5. Realtime: push new messages and inbox changes to open pages
--
-- Supabase Realtime watches tables in the "supabase_realtime" publication
-- and sends changes to browsers that subscribed:
--   * an open chat listens for new rows in messages for that chat
--   * the inbox and the Messages tab's red dot listen for changes to
--     conversations (a new last message, or a chat being marked read)
--
-- Realtime respects RLS for each subscriber: a student is only sent a change
-- if the select policies above let them read that row. So only the buyer
-- and the seller in a chat ever receive its messages.
--
-- The DO block only adds a table if it isn't already in the publication,
-- so re-running this part doesn't error.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;

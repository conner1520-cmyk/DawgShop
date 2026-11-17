// Messaging rules and display helpers shared by the server and the browser.
// The database (supabase/migrations/0004_messaging.sql) repeats the length
// limit, so keep the two in sync.

export const MESSAGE_MAX = 2000;

// A row from public.messages.
export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export const MESSAGE_SELECT = "id, conversation_id, sender_id, body, created_at";

// A row from public.conversations, with both people's names from profiles.
// Never add profiles.email here: students can't read it (0003_listings.sql).
export const CONVERSATION_SELECT =
  "id, listing_id, listing_title, listing_photo, buyer_id, seller_id, last_message_at, last_message_sender, last_message_preview, buyer_last_read_at, seller_last_read_at, buyer:profiles!conversations_buyer_id_fkey(name), seller:profiles!conversations_seller_id_fkey(name)";

export type ConversationRow = {
  id: string;
  listing_id: string | null;
  listing_title: string;
  listing_photo: string | null;
  buyer_id: string;
  seller_id: string;
  last_message_at: string | null;
  last_message_sender: string | null;
  last_message_preview: string | null;
  buyer_last_read_at: string | null;
  seller_last_read_at: string | null;
  buyer: { name: string } | null;
  seller: { name: string } | null;
};

// The other person's name in a chat, from the signed-in student's side.
export function otherName(c: ConversationRow, me: string) {
  const other = c.buyer_id === me ? c.seller : c.buyer;
  return other?.name || "A UGA student";
}

// True when the newest message is from the other person and arrived after
// you last opened the chat. Same rule as unread_conversation_count().
export function isUnread(c: ConversationRow, me: string) {
  if (!c.last_message_at || !c.last_message_sender || c.last_message_sender === me) return false;
  const readAt = c.buyer_id === me ? c.buyer_last_read_at : c.seller_last_read_at;
  return !readAt || Date.parse(c.last_message_at) > Date.parse(readAt);
}

export type MessageCheck = { ok: true; body: string } | { ok: false; error: string };

// Checks a message before sending. Trims spaces and line breaks from both
// ends, keeps line breaks inside, and rejects blank or too-long messages.
// The browser runs this for instant feedback; the server runs it again.
export function validateMessage(raw: unknown): MessageCheck {
  if (typeof raw !== "string") return { ok: false, error: "Type a message first." };
  const body = raw.trim();
  if (!body) return { ok: false, error: "Type a message first." };
  if (body.length > MESSAGE_MAX) {
    return { ok: false, error: `Keep messages under ${MESSAGE_MAX.toLocaleString("en-US")} characters.` };
  }
  return { ok: true, body };
}

// ---------------------------------------------------------------------------
// Time formatting. Everything uses Athens, GA time: servers run in UTC, and
// the server and the browser must agree on what "today" is.
// ---------------------------------------------------------------------------

const TZ = "America/New_York";
const MINUTE = 6e4;
const HOUR = 36e5;
const DAY = 864e5;

const toMs = (t: string | number) => (typeof t === "number" ? t : Date.parse(t));

// 'YYYY-MM-DD' in Athens time, for comparing calendar days.
export function dayKey(t: string | number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    toMs(t),
  );
}

// "3:41 PM"
export function clockTime(t: string | number) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(toMs(t));
}

// Whole calendar days between two moments, in Athens time (0 = same day).
function daysApart(t: number, now: number) {
  const a = Date.parse(`${dayKey(t)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(now)}T00:00:00Z`);
  return Math.round((b - a) / DAY);
}

// For inbox rows: "now", "5m", "3h", "Yesterday", "Mon", "Oct 3".
export function shortTime(t: string | number, now: number = Date.now()) {
  const ms = toMs(t);
  const diff = now - ms;
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  const days = daysApart(ms, now);
  if (days <= 0) return `${Math.floor(diff / HOUR)}h`;
  if (days === 1) return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(ms);
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(ms);
}

// For the day separators in a chat: "Today", "Yesterday", "Monday",
// "Mon, Oct 3", or "Oct 3, 2025" for an earlier year.
export function dayLabel(t: string | number, now: number = Date.now()) {
  const ms = toMs(t);
  const days = daysApart(ms, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" }).format(ms);
  if (dayKey(ms).slice(0, 4) === dayKey(now).slice(0, 4)) {
    return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(ms);
  }
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" }).format(ms);
}

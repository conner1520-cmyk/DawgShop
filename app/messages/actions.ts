"use server";

import { redirect } from "next/navigation";
import { getSignedInUser } from "@/lib/auth";
import { isUuid } from "@/lib/listings";
import { MESSAGE_SELECT, validateMessage, type Message } from "@/lib/messages";

const SIGNED_OUT = "Your session ended. Sign in again, then try once more.";
const NOT_AVAILABLE = "This conversation isn't available.";

export type StartState = { error: string };

// Plain-language versions of the errors start_conversation raises
// (supabase/migrations/0004_messaging.sql).
function startError(message: string) {
  if (message.includes("LISTING_UNAVAILABLE")) return "This listing isn't available anymore.";
  if (message.includes("OWN_LISTING")) return "This is your own listing.";
  if (message.includes("NO_PROFILE")) return "Finish setting up your profile before messaging.";
  if (message.includes("NOT_SIGNED_IN")) return SIGNED_OUT;
  return "We couldn't open the chat. Check your connection and try again.";
}

// "Message seller" on a listing page. Opens the chat for this listing,
// starting one if needed (the database returns the existing chat if there is
// one), then goes to it. Used as a form action with useActionState, so the
// listing id is bound in and the other two arguments come from React.
export async function startConversation(listingId: string, _prev?: StartState): Promise<StartState> {
  void _prev;
  const session = await getSignedInUser();
  if (!session) return { error: SIGNED_OUT };
  if (typeof listingId !== "string" || !isUuid(listingId)) return { error: startError("LISTING_UNAVAILABLE") };

  const { data, error } = await session.supabase.rpc("start_conversation", { p_listing_id: listingId });
  if (error || typeof data !== "string") {
    console.error("start_conversation failed:", error?.code, error?.message);
    return { error: startError(error?.message ?? "") };
  }
  // redirect() works by throwing, so it must stay outside any try/catch.
  redirect(`/messages/${data}`);
}

export type SendResult = { ok: true; message: Message } | { ok: false; error: string };

// Send one message. The sender is always the signed-in student (from the
// session), never something the browser says. RLS also checks that you're in
// the chat.
export async function sendMessage(conversationId: string, body: string): Promise<SendResult> {
  const session = await getSignedInUser();
  if (!session) return { ok: false, error: SIGNED_OUT };
  if (typeof conversationId !== "string" || !isUuid(conversationId)) return { ok: false, error: NOT_AVAILABLE };

  const checked = validateMessage(body);
  if (!checked.ok) return { ok: false, error: checked.error };

  const { data, error } = await session.supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: session.user.id, body: checked.body })
    .select(MESSAGE_SELECT)
    .single();
  if (error || !data) {
    console.error("message insert failed:", error?.code, error?.message);
    // 42501: RLS said no (not in this chat). 23503: the chat was deleted.
    if (error?.code === "42501" || error?.code === "23503") return { ok: false, error: NOT_AVAILABLE };
    return { ok: false, error: "Not sent. Check your connection and try again." };
  }
  return { ok: true, message: data as Message };
}

// Mark a chat as read for the signed-in student. Best effort: an error only
// means the red dot stays a little longer.
export async function markRead(conversationId: string): Promise<void> {
  const session = await getSignedInUser();
  if (!session || typeof conversationId !== "string" || !isUuid(conversationId)) return;
  const { error } = await session.supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  if (error) console.error("mark_conversation_read failed:", error.code, error.message);
}

// How many chats have unread messages, for the red dot on the Messages tab.
// Returns 0 on any error, so a problem never shows a false dot.
export async function getUnreadCount(): Promise<number> {
  try {
    const session = await getSignedInUser();
    if (!session) return 0;
    const { data, error } = await session.supabase.rpc("unread_conversation_count");
    if (error) {
      console.error("unread_conversation_count failed:", error.code, error.message);
      return 0;
    }
    return typeof data === "number" ? data : 0;
  } catch (err) {
    console.error("unread count failed:", err);
    return 0;
  }
}

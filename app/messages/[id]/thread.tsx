"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { markRead, sendMessage, type SendResult } from "@/app/messages/actions";
import { SendIcon } from "@/components/icons";
import { channelSuffix } from "@/components/messages-live";
import { createClient } from "@/lib/supabase/client";
import { MESSAGE_MAX, clockTime, dayKey, dayLabel, validateMessage, type Message } from "@/lib/messages";

// A message you sent that the server hasn't confirmed yet, or that failed.
type Pending = { key: string; body: string; status: "sending" | "failed" };

const SAFETY = "Meet in a public place on campus. Pay in person with cash or Venmo.";

// Adds a message unless one with the same id is already there.
function addUnique(list: Message[], m: Message) {
  return list.some((x) => x.id === m.id) ? list : [...list, m];
}

// The messages, the live updates, and the message box for one chat.
export function Thread({
  conversationId,
  me,
  otherName,
  initialMessages,
}: {
  conversationId: string;
  me: string;
  otherName: string;
  initialMessages: Message[];
}) {
  const router = useRouter();
  // Messages that arrived after the page loaded (Realtime) or that you sent
  // from this page. Merged with the server's list below, by id.
  const [received, setReceived] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shownBefore = useRef(false);

  // Everything in time order, each message once.
  const messages = useMemo(() => {
    const byId = new Map<string, Message>();
    for (const m of [...initialMessages, ...received]) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) =>
      a.created_at === b.created_at ? a.id.localeCompare(b.id) : Date.parse(a.created_at) - Date.parse(b.created_at),
    );
  }, [initialMessages, received]);

  // Opening the chat marks it read. Then listen for new messages from the
  // other person; RLS means only the two of you can receive them.
  useEffect(() => {
    void markRead(conversationId);
    // Next.js keeps recently visited pages alive in the background. Coming
    // back to this chat, fetch anything that arrived while it was hidden.
    if (shownBefore.current) router.refresh();
    shownBefore.current = true;

    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`thread-${conversationId}-${channelSuffix()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message;
          if (!m?.id || m.sender_id === me) return;
          setReceived((list) => addUnique(list, m));
          // You're looking at it, so it's read.
          void markRead(conversationId);
        },
      )
      .subscribe();

    // Leaving (or hiding) the chat stops listening.
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, me, router]);

  // Keep the newest message in view.
  const count = messages.length + pending.length;
  useLayoutEffect(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, [count]);

  // Grow the message box with its text, up to about five lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  async function deliver(item: Pending) {
    setSending(true);
    setPending((list) => list.map((p) => (p.key === item.key ? { ...p, status: "sending" } : p)));
    let res: SendResult;
    try {
      res = await sendMessage(conversationId, item.body);
    } catch {
      res = { ok: false, error: "Not sent." };
    }
    setSending(false);
    if (res.ok) {
      const saved = res.message;
      setPending((list) => list.filter((p) => p.key !== item.key));
      setReceived((list) => addUnique(list, saved));
    } else {
      setPending((list) => list.map((p) => (p.key === item.key ? { ...p, status: "failed" } : p)));
    }
  }

  function send() {
    if (sending) return;
    const checked = validateMessage(text);
    if (!checked.ok) return;
    // Show it right away; deliver() swaps in the saved copy or marks it failed.
    const item: Pending = { key: channelSuffix(), body: checked.body, status: "sending" };
    setPending((list) => [...list, item]);
    setText("");
    inputRef.current?.focus();
    void deliver(item);
  }

  const canSend = !sending && text.trim().length > 0;
  const left = MESSAGE_MAX - text.length;

  return (
    <>
      <div className="bubbles" role="log" aria-label={`Messages with ${otherName}`}>
        <div className="b sys">{SAFETY}</div>
        {messages.length === 0 && pending.length === 0 && (
          <div className="b sys">Say hi to {otherName}. Ask a question or suggest a time to meet.</div>
        )}
        {messages.map((m, i) => {
          const newDay = i === 0 || dayKey(messages[i - 1].created_at) !== dayKey(m.created_at);
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="b sys daysep" suppressHydrationWarning>
                  {dayLabel(m.created_at)} {clockTime(m.created_at)}
                </div>
              )}
              <div className={`b ${m.sender_id === me ? "me" : "them"}`}>
                <span className="sr">{m.sender_id === me ? "You" : otherName}: </span>
                {m.body}
              </div>
            </Fragment>
          );
        })}
        {pending.map((p) =>
          p.status === "failed" ? (
            <button
              key={p.key}
              type="button"
              className="b me failed"
              onClick={() => {
                if (!sending) void deliver(p);
              }}
            >
              {p.body}
              <span className="failnote">Not sent, tap to retry</span>
            </button>
          ) : (
            <div key={p.key} className="b me sending">
              {p.body}
              <span className="sr"> (sending)</span>
            </div>
          ),
        )}
      </div>

      {/* Room for the fixed message box, so the last message isn't hidden. */}
      <div className="composerspace" aria-hidden="true" />
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label className="sr" htmlFor="msgIn">
          Message {otherName}
        </label>
        <div className="composerfield">
          <textarea
            id="msgIn"
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={MESSAGE_MAX}
            placeholder={`Message ${otherName}`}
            autoComplete="off"
            enterKeyHint="send"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter starts a new line. Skip while an
              // input method (e.g. for Chinese or Japanese) is composing.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          {left <= 200 && (
            <span className="meta counter" aria-live="polite">
              {left} characters left
            </span>
          )}
        </div>
        <button type="submit" className="iconbtn send" aria-label="Send" disabled={!canSend}>
          <SendIcon />
        </button>
      </form>
    </>
  );
}

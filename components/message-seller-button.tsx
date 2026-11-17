"use client";

import { useActionState } from "react";
import { startConversation, type StartState } from "@/app/messages/actions";

// The "Message seller" button on someone else's listing. It's a form that
// posts to the startConversation server action, which opens the chat (new or
// existing) and goes to it. If that fails, the error shows under the button.
export function MessageSellerButton({ listingId, free }: { listingId: string; free: boolean }) {
  const [state, action, pending] = useActionState<StartState, FormData>(startConversation.bind(null, listingId), {
    error: "",
  });

  return (
    <form action={action} className="actions" aria-busy={pending || undefined}>
      <button type="submit" className="btn primary block" disabled={pending}>
        {pending ? "Opening chat..." : free ? "Ask to claim it" : "Message seller"}
      </button>
      {state.error && (
        <div className="err" role="alert">
          {state.error}
        </div>
      )}
    </form>
  );
}

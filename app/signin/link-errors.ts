import { NOT_UGA_ERROR } from "@/lib/uga";

// Messages for /signin?error=<key>, set by the /auth/callback link fallback.
export const LINK_ERRORS = {
  expired: "That link expired. Send yourself a new code.",
  not_uga: NOT_UGA_ERROR,
  other_device:
    "Open the sign-in link on the same phone or browser you used to ask for it, or send yourself a code instead.",
  failed: "We couldn't finish signing you in. Send yourself a new code.",
} as const;

export type LinkErrorKey = keyof typeof LINK_ERRORS;

export function linkErrorMessage(key: string | string[] | undefined): string | null {
  if (typeof key !== "string" || !(key in LINK_ERRORS)) return null;
  return LINK_ERRORS[key as LinkErrorKey];
}

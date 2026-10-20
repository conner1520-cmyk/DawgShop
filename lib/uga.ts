// The one place that decides who counts as a UGA student.
// Used by the sign-in form (client), the sign-in server action, and the
// auth callback. The database enforces the same rule in
// supabase/migrations/0001_profiles.sql.

export const UGA_DOMAIN = "@uga.edu";

export const EMAIL_SHAPE_ERROR = "Enter a full email address, like you@uga.edu.";
export const NOT_UGA_ERROR =
  "DawgShop is only for UGA students. Use your @uga.edu email.";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns an error message for the email, or null if it is a valid @uga.edu address. */
export function ugaEmailError(email: string): string | null {
  const value = normalizeEmail(email);
  if (!EMAIL_SHAPE.test(value)) return EMAIL_SHAPE_ERROR;
  if (!value.endsWith(UGA_DOMAIN)) return NOT_UGA_ERROR;
  return null;
}

export function isUgaEmail(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  return ugaEmailError(email) === null;
}

/** "jane.doe22@uga.edu" -> "Jane". Ported from the prototype's firstName(). */
export function firstName(email: string): string {
  const local = email.split("@")[0];
  const t = local.split(/[._\-0-9]+/).filter(Boolean)[0] || local;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Supabase lets each project pick an OTP length from 6 to 10 digits
// (Authentication -> Sign In / Providers -> Email). Accept the whole range so
// the app keeps working if that setting changes.
export const CODE_MIN_LENGTH = 6;
export const CODE_MAX_LENGTH = 10;
export const CODE_FORMAT_ERROR = "Enter the code from your email.";

export function isSignInCode(code: string): boolean {
  return new RegExp(`^[0-9]{${CODE_MIN_LENGTH},${CODE_MAX_LENGTH}}$`).test(code);
}

/** Keep only digits, up to the longest code. Pasting "1234 5678" gives "12345678". */
export function cleanCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, CODE_MAX_LENGTH);
}

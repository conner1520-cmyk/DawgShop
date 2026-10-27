// Password rules, shared by the browser forms and the server actions.
// Supabase's minimum length should match PASSWORD_MIN (see supabase/README.md).

export const PASSWORD_MIN = 8;
// bcrypt, which Supabase uses to store passwords, only looks at the first 72 bytes.
export const PASSWORD_MAX = 72;

export const PASSWORD_REQUIRED_ERROR = "Enter your password.";
export const PASSWORD_MISMATCH_ERROR = "The passwords don't match.";

/** Length in bytes, which is what bcrypt counts (an emoji is 4 bytes). */
function byteLength(pw: string): number {
  return new TextEncoder().encode(pw).length;
}

/** Returns an error message for a NEW password, or null if it's allowed. */
export function passwordError(pw: string): string | null {
  if (typeof pw !== "string" || pw.length === 0) return "Create a password.";
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (byteLength(pw) > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  return null;
}

export type PasswordStrength = { level: "weak" | "ok" | "strong"; label: "Weak" | "OK" | "Strong" };

/**
 * A rough hint only, based on length and how many kinds of characters are
 * used (lowercase, uppercase, numbers, symbols). It never blocks a password
 * that passes passwordError().
 */
export function passwordStrength(pw: string): PasswordStrength {
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(pw)).length;
  const len = pw.length;
  if (len >= 16 || (len >= 12 && kinds >= 3)) return { level: "strong", label: "Strong" };
  if (len >= 12 || (len >= PASSWORD_MIN && kinds >= 2)) return { level: "ok", label: "OK" };
  return { level: "weak", label: "Weak" };
}

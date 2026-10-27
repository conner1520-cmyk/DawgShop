"use server";

import { redirect } from "next/navigation";
import { getSignedInUser } from "@/lib/auth";
import { passwordUpdateError } from "@/lib/auth-errors";
import { PASSWORD_MISMATCH_ERROR, passwordError } from "@/lib/password";

export type SetPasswordState = {
  errors?: { password?: string; confirm?: string; form?: string };
};

export async function savePassword(_prev: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  // Re-check who is signed in; proxy.ts alone isn't enough.
  const session = await getSignedInUser();
  if (!session) redirect("/signin");

  // Never trim passwords: spaces can be part of them.
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  const pwErr = passwordError(password);
  if (pwErr) return { errors: { password: pwErr } };
  if (confirm !== password) return { errors: { confirm: PASSWORD_MISMATCH_ERROR } };

  const { error } = await session.supabase.auth.updateUser({ password });
  if (error) {
    console.error("updateUser(password) failed:", error.code, error.status, error.message);
    const message = passwordUpdateError(error);
    const onField = error.code === "weak_password" || error.code === "same_password";
    return onField ? { errors: { password: message } } : { errors: { form: message } };
  }

  redirect("/?notice=password_saved");
}

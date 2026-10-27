"use server";

import { redirect } from "next/navigation";
import { getSignedInUser } from "@/lib/auth";
import { AREAS } from "@/lib/areas";
import { passwordUpdateError } from "@/lib/auth-errors";
import { PASSWORD_MISMATCH_ERROR, passwordError } from "@/lib/password";

export type WelcomeState = {
  errors?: { name?: string; area?: string; password?: string; confirm?: string; form?: string };
};

const MAX_NAME = 50;

export async function saveProfile(_prev: WelcomeState, formData: FormData): Promise<WelcomeState> {
  // Re-check who is signed in; never trust the form for the user id or email.
  const session = await getSignedInUser();
  if (!session) redirect("/signin");

  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const area = String(formData.get("pickup_area") ?? "");
  // Never trim passwords: spaces can be part of them.
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!name) return { errors: { name: "Add your name so other students know who they're talking to." } };
  if (name.length > MAX_NAME) return { errors: { name: `Keep your name under ${MAX_NAME} characters.` } };
  if (area && !(AREAS as readonly string[]).includes(area)) {
    return { errors: { area: "Choose a spot from the list, or skip it for now." } };
  }
  const pwErr = passwordError(password);
  if (pwErr) return { errors: { password: pwErr } };
  if (confirm !== password) return { errors: { confirm: PASSWORD_MISMATCH_ERROR } };

  // Set the password first, so a profile never exists without one.
  const { error: pwError } = await session.supabase.auth.updateUser({ password });
  // "same_password" here means a previous try already saved this exact
  // password and then the profile save failed. The password is already right,
  // so carry on and save the profile.
  if (pwError && pwError.code !== "same_password") {
    console.error("updateUser(password) failed:", pwError.code, pwError.status, pwError.message);
    const message = passwordUpdateError(pwError);
    return pwError.code === "weak_password" ? { errors: { password: message } } : { errors: { form: message } };
  }

  const { error } = await session.supabase.from("profiles").upsert({
    id: session.user.id,
    email: session.email,
    name,
    pickup_area: area || null,
  });
  if (error) {
    console.error("profile save failed:", error.code, error.message);
    return { errors: { form: "We couldn't save your profile. Try again in a minute." } };
  }

  redirect("/");
}

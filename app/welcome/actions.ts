"use server";

import { redirect } from "next/navigation";
import { getSignedInUser } from "@/lib/auth";
import { AREAS } from "@/lib/areas";

export type WelcomeState = {
  errors?: { name?: string; area?: string; form?: string };
};

const MAX_NAME = 50;

export async function saveProfile(_prev: WelcomeState, formData: FormData): Promise<WelcomeState> {
  // Re-check who is signed in; never trust the form for the user id or email.
  const session = await getSignedInUser();
  if (!session) redirect("/signin");

  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const area = String(formData.get("pickup_area") ?? "");

  if (!name) return { errors: { name: "Add your name so other students know who they're talking to." } };
  if (name.length > MAX_NAME) return { errors: { name: `Keep your name under ${MAX_NAME} characters.` } };
  if (area && !(AREAS as readonly string[]).includes(area)) {
    return { errors: { area: "Choose a spot from the list, or skip it for now." } };
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

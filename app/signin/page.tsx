import { Suspense } from "react";
import type { Metadata } from "next";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { linkErrorMessage } from "./link-errors";
import { SigninForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in - DawgShop" };

// Reads ?error= from the URL. It's request data, so it streams in behind Suspense
// while the rest of the sign-in screen is served right away.
async function LinkError({ searchParams }: { searchParams: PageProps<"/signin">["searchParams"] }) {
  const message = linkErrorMessage((await searchParams).error);
  if (!message) return null;
  return (
    <p className="err" role="alert" style={{ margin: "-12px 0 8px" }}>
      {message}
    </p>
  );
}

export default function SigninPage({ searchParams }: PageProps<"/signin">) {
  return (
    <SigninForm
      configured={getSupabaseEnv() !== null}
      linkError={
        <Suspense fallback={null}>
          <LinkError searchParams={searchParams} />
        </Suspense>
      }
    />
  );
}

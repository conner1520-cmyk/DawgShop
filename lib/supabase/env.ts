// Reads the Supabase settings from .env.local. Returns null when they are
// missing so the app can show a "not connected" notice instead of crashing.
export function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export const NOT_CONNECTED_MESSAGE =
  "Supabase isn't connected yet. Copy .env.local.example to .env.local and add your project URL and anon key.";

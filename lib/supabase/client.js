import { createBrowserClient } from '@supabase/ssr';

// One client for the whole tab. Creating a second one would register a second
// onAuthStateChange listener against the same storage, so a single sign-out
// fires every subscriber twice and the UI flickers through inconsistent states.
let client;

export function getSupabase() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return client;
}

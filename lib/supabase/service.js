import { createClient } from '@supabase/supabase-js';

// The server-only client, holding the service_role key.
//
// It bypasses row level security entirely, which is exactly why it exists: the
// audit cache and the lookup ledger are infrastructure no browser should reach,
// and RLS on those tables is declared with no policies so that this is the only
// key that can touch them.
//
// Two rules follow from that and neither is negotiable. This module must never
// be imported by a Client Component — the key would be bundled and shipped.
// And the key is read from SUPABASE_SERVICE_KEY, deliberately *without* a
// NEXT_PUBLIC_ prefix, so Next cannot inline it into client output even by
// accident.
let client = null;

/** True when the server has been given a service key to work with. */
export function hasServiceClient() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

/** The client, or null when unconfigured — callers degrade rather than throw,
 * so a deployment without the key still serves every request, just uncached and
 * uncapped. */
export function getServiceClient() {
  if (!hasServiceClient()) return null;
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      // No session to persist and nothing to refresh: this key is not a user.
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return client;
}

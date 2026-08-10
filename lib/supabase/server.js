import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side client, bound to the request's cookie jar. Used by the OAuth
// callback route, which is the one place that has to *write* a session.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components can read cookies but not set them. Harmless
            // here: proxy.js refreshes the session on every request, so a
            // write that lands in a render pass is redundant rather than lost.
          }
        },
      },
    }
  );
}

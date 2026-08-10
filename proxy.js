import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Next 16 renamed the `middleware.js` convention to `proxy.js`, and the
// exported function with it. Same capabilities, different name — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
//
// Two jobs here:
//  1. Refresh the Supabase session cookie on every request. Access tokens are
//     short-lived, so without this a tab left open overnight wakes up signed
//     out even though the refresh token is still perfectly good.
//  2. Keep unauthenticated callers out. This is what closes the hole we opened
//     when Firebase came out: /api/generate-* spends real OpenAI credits and
//     /api/ig-fetch drives a real logged-in Instagram session, and until now
//     anyone who found the URL could call both.

// Reachable signed out, for obvious reasons.
const PUBLIC_PREFIXES = ['/login', '/auth/'];

function isPublic(pathname) {
  return PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p));
}

export async function proxy(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Write refreshed cookies to both sides: the request so anything
          // rendering downstream sees the new session, and the response so the
          // browser actually keeps it.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser(), not getSession(): it verifies the JWT with the auth server
  // rather than trusting whatever the cookie claims.
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  if (user || isPublic(pathname)) return response;

  // API callers get a status they can act on. A redirect to an HTML login page
  // would surface in the UI as a JSON parse error, which says nothing useful.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, error: 'you need to be signed in to do that' },
      { status: 401 }
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  // Remember where they were headed so the callback can send them back.
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except Next's own assets and static image files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

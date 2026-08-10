import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Where Google sends the user back to. Supabase hands over a one-time code;
// exchanging it here is what actually writes the session cookie.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  // Google reports a refused or cancelled consent as an error param, not a
  // failed exchange, so it has to be read before looking for the code.
  const oauthError = searchParams.get('error_description') || searchParams.get('error');
  if (oauthError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(oauthError)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Google sent us back without a sign-in code')}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  // Only ever bounce to a path on this site — `next` arrives from the query
  // string, so an absolute URL here would be an open redirect.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(`${origin}${safeNext}`);
}

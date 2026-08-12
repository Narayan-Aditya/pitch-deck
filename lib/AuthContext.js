'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSupabase } from './supabase/client';
import { DRIVE_SCOPE } from './googleSlides';

const AuthContext = createContext(null);

// Where the Google access token lives between the sign-in redirect and the
// export button being pressed.
//
// Supabase hands back `provider_token` once, on the session it mints at the
// OAuth exchange, and does not refresh it — the next time the Supabase access
// token rotates, the Google one is gone from the session. So it gets copied
// out here the moment it appears.
//
// sessionStorage rather than localStorage: this is an OAuth access token, and
// it should die with the tab rather than sit on disk. The blast radius is
// small by construction — the token is drive.file-scoped, so it can only touch
// files this app created, and Google expires it in about an hour — but "small"
// is not "none", so it gets the shorter-lived store.
const DRIVE_TOKEN_KEY = 'og_drive_token';

function rememberDriveToken(session) {
  if (typeof window === 'undefined') return;
  const token = session?.provider_token;
  if (token) sessionStorage.setItem(DRIVE_TOKEN_KEY, token);
}

export function getDriveToken() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(DRIVE_TOKEN_KEY);
}

export function forgetDriveToken() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(DRIVE_TOKEN_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    // The profile row carries is_admin, which decides whether the admin link
    // and page appear. It is created by a trigger on signup, but the very
    // first page load can land before that trigger commits, so a missing row
    // is treated as "not admin yet" rather than an error.
    async function loadProfile(u) {
      if (!u) { setProfile(null); return; }
      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, is_admin')
        .eq('id', u.id)
        .maybeSingle();
      if (active) setProfile(data || null);
    }

    // The session carries provider_token only on the load right after the OAuth
    // redirect, so both entry points have to look for it.
    supabase.auth.getSession().then(({ data }) => rememberDriveToken(data?.session));

    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      await loadProfile(data.user);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') forgetDriveToken();
      else rememberDriveToken(session);
      setUser(session?.user ?? null);
      await loadProfile(session?.user ?? null);
      if (active) setLoading(false);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  // `reconsent` forces Google to show the permission screen again. Normal
  // sign-in skips it once someone has approved before, which would silently
  // return a token still missing the Drive scope for anyone who signed in
  // before this app ever asked for it.
  const signIn = useCallback(async (next, { reconsent = false } = {}) => {
    const supabase = getSupabase();
    const callback = new URL('/auth/callback', window.location.origin);
    if (next) callback.searchParams.set('next', next);

    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback.toString(),
        scopes: DRIVE_SCOPE,
        ...(reconsent ? { queryParams: { prompt: 'consent' } } : {}),
      },
    });
  }, []);

  // Sends the user back through Google to pick up the Drive permission, then
  // returns them to wherever they were. Safe to call mid-report: everything is
  // autosaved to Postgres, so the redirect costs nothing but a page load.
  const connectDrive = useCallback(async (returnTo) => {
    forgetDriveToken();
    return signIn(returnTo, { reconsent: true });
  }, [signIn]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    forgetDriveToken();
    setUser(null);
    setProfile(null);
    // Full reload rather than router.push, which is what the lint rule wants.
    // A client-side navigation keeps the React tree alive, so the report page's
    // state — a prospect's whole brief — survives into the next session on a
    // shared laptop. Throwing the document away is the only way to be sure it
    // is gone. Worth one slow navigation on the rarest action in the app.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, connectDrive }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

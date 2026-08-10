'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSupabase } from './supabase/client';

const AuthContext = createContext(null);

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

    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      await loadProfile(data.user);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      await loadProfile(session?.user ?? null);
      if (active) setLoading(false);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (next) => {
    const supabase = getSupabase();
    const callback = new URL('/auth/callback', window.location.origin);
    if (next) callback.searchParams.set('next', next);

    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    });
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
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
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

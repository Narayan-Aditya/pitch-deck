'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider } from './firebaseClient';
import { AUTH_ENABLED } from './appConfig';

const AuthContext = createContext(null);

// Stand-in identity used in local-only mode so pages that key off `user`
// (and the report store's ownerId) still have something stable to use.
const LOCAL_USER = { uid: 'local', displayName: 'Local Mode', email: null, photoURL: null };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(AUTH_ENABLED ? null : LOCAL_USER);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(AUTH_ENABLED);

  useEffect(() => {
    if (!AUTH_ENABLED) return; // no Firebase listener in local-only mode
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const popupSignIn = useCallback(async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || null;
    setAccessToken(token);
    return { user: result.user, accessToken: token };
  }, []);

  const signIn = useCallback(async () => {
    const { user } = await popupSignIn();
    return user;
  }, [popupSignIn]);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    setAccessToken(null);
  }, []);

  // Firebase only hands back the Drive-scoped OAuth access token at the
  // moment of the sign-in popup — it doesn't persist across page reloads.
  // "Save to Google Slides" calls this first; if the token was lost to a
  // refresh, it silently re-runs the popup (already-signed-in, so this is a
  // quick re-consent, not a fresh login) rather than failing the upload.
  const getFreshAccessToken = useCallback(async () => {
    if (accessToken) return accessToken;
    const { accessToken: fresh } = await popupSignIn();
    return fresh;
  }, [accessToken, popupSignIn]);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, getFreshAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

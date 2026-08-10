// Temporary escape hatch while the Firestore/Google-login setup is being
// sorted out: set NEXT_PUBLIC_AUTH_ENABLED=false in .env.local to run the
// app fully local — no sign-in, reports stored in localStorage instead of
// Firestore. Everything else (deck generation, download) is identical.
// Flip it back to true (or delete the var) to restore the real auth flow.
//
// Note: "Save to Google Slides" still needs a real sign-in, so that button
// is hidden while auth is off — plain .pptx download works either way.
export const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED !== 'false';

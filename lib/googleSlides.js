// Pushes a generated .pptx into the signed-in user's Drive as a native Google
// Slides file.
//
// Drive converts on upload when the target mimeType is the Slides app type, so
// there is no separate Slides-API step: pptxgenjs's output becomes the source
// document as-is. This is the same converter you get by dragging the file into
// Drive by hand — the button saves clicks, it does not improve fidelity.
//
// A version of this existed before and was removed in 571d197, because the
// Firebase sign-in that minted its access token was removed with it. Google
// sign-in came back on Supabase in 26c48f1, so the token has a source again.
//
// Scope is drive.file, deliberately: it grants access only to files this app
// itself created, not the user's Drive. It is also a non-sensitive scope, so
// it needs no Google verification review the way full `drive` would.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const SLIDES_MIME = 'application/vnd.google-apps.presentation';

// Drive's uploadType=multipart wants **multipart/related**, with the metadata
// part first and the file second. It is not multipart/form-data: handing it a
// FormData body — which is the obvious thing to reach for, and what the earlier
// version of this file did — gets a flat 400 "Bad Request" with no hint as to
// why. So the body is assembled by hand.
//
// CRLF line endings are load-bearing. So is the blank line between a part's
// headers and its content, and the trailing `--` on the closing boundary.
function buildRelatedBody(metadata, fileBlob, boundary) {
  const head =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n' +
    '\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${PPTX_MIME}\r\n` +
    '\r\n';
  const tail = `\r\n--${boundary}--`;
  // Blob takes strings and Blobs side by side, so the .pptx bytes go in
  // untouched — no base64, no string round-trip that would corrupt the zip.
  return new Blob([head, fileBlob, tail]);
}

// The boundary must not occur inside the body. The body is a zip, so any random
// token is safe; randomUUID is only unavailable on insecure origins, hence the
// fallback.
function makeBoundary() {
  const rand = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `og-deck-${rand}`;
}

// Thrown when Google rejects the token rather than the file. The caller turns
// this into "reconnect Google" instead of a generic failure, because the fix
// is a fresh consent, not a retry.
export class DriveAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export async function uploadPptxAsGoogleSlides(accessToken, pptxBlob, fileName) {
  if (!accessToken) {
    throw new DriveAuthError('no Google Drive permission yet');
  }

  // The target mimeType is what makes Drive convert rather than just store.
  const metadata = { name: fileName, mimeType: SLIDES_MIME };
  const boundary = makeBoundary();

  let res;
  try {
    res = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,webViewLink`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Set explicitly: fetch would otherwise take the Blob's own type, and
        // the boundary has to travel with the header or Drive cannot split the
        // parts.
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: buildRelatedBody(metadata, pptxBlob, boundary),
    });
  } catch {
    throw new Error('could not reach Google Drive — check the connection');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // 401 is an expired or revoked token; 403 is usually the scope missing
    // because the user signed in before Drive access was ever asked for. Both
    // are fixed by consenting again, not by pressing the button again.
    if (res.status === 401 || res.status === 403) {
      throw new DriveAuthError(data.error?.message || 'Google would not accept the saved permission');
    }
    throw new Error(data.error?.message || `Google Drive returned HTTP ${res.status}`);
  }

  return {
    id: data.id,
    // webViewLink is the canonical "open in Slides" url. Build it by hand if
    // Google omits it — the id alone is enough.
    url: data.webViewLink || `https://docs.google.com/presentation/d/${data.id}/edit`,
  };
}

const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

// Uploads a generated .pptx into the signed-in user's Drive as a native
// Google Slides file — Drive auto-converts on upload when the target
// mimeType is the Slides app type, so no separate Slides-API slide-building
// step is needed; pptxgenjs's output becomes the source document as-is.
export async function uploadPptxAsGoogleSlides(accessToken, pptxBlob, fileName) {
  const metadata = {
    name: fileName,
    mimeType: 'application/vnd.google-apps.presentation',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', pptxBlob, fileName);

  const res = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Google Drive upload failed');
  }

  return data.webViewLink || `https://docs.google.com/presentation/d/${data.id}/edit`;
}

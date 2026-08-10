// Fills in base64 thumbnails just before a deck is built.
//
// Deliberately NOT part of reportData: three base64 thumbnails run to roughly
// 950KB, against a 1MiB Firestore document limit, so persisting them would
// make autosave start failing silently. Metadata is stored (~1KB); the bytes
// are fetched fresh at export time and thrown away after.
export async function hydrateCreatorThumbs(reportData) {
  const matches = reportData?.creatorMatches;
  if (!matches?.length) return reportData;

  try {
    const res = await fetch('/api/creator-thumbs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: matches.map(m => ({ platform: m.platform, id: m.id })) }),
    });
    const data = await res.json();
    if (!data?.success) return reportData;

    // Return a copy — mutating the caller's object would push base64 into the
    // state that autosave serialises.
    return {
      ...reportData,
      creatorMatches: matches.map(m => {
        const t = data.thumbs?.[m.id];
        return t ? { ...m, thumbDataUrl: t.dataUrl, thumbW: t.w, thumbH: t.h } : m;
      }),
    };
  } catch {
    // Image fetching must never block a download.
    return reportData;
  }
}

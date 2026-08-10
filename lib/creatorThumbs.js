// Fills in base64 thumbnails just before a deck is built.
//
// Deliberately NOT part of reportData: three base64 thumbnails run to roughly
// 950KB, against a 1MiB Firestore document limit, so persisting them would
// make autosave start failing silently. Metadata is stored (~1KB); the bytes
// are fetched fresh at export time and thrown away after.
// Manually-added entries carry a synthetic id, so pull the real video id out
// of the pasted URL — otherwise a hand-added YouTube video would always fall
// back to a drawn tile even though its thumbnail is perfectly fetchable.
function youtubeIdFrom(url) {
  const m = String(url || '').match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : null;
}

function thumbIdFor(match) {
  if (match.platform !== 'youtube') return null;
  return match.manual ? youtubeIdFrom(match.url) : match.id;
}

export async function hydrateCreatorThumbs(reportData) {
  const matches = reportData?.creatorMatches;
  if (!matches?.length) return reportData;

  const wanted = matches
    .map(m => ({ match: m, thumbId: thumbIdFor(m) }))
    .filter(x => x.thumbId);
  if (!wanted.length) return reportData;

  try {
    const res = await fetch('/api/creator-thumbs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: wanted.map(x => ({ platform: 'youtube', id: x.thumbId })) }),
    });
    const data = await res.json();
    if (!data?.success) return reportData;

    // Return a copy — mutating the caller's object would push base64 into the
    // state that autosave serialises.
    return {
      ...reportData,
      creatorMatches: matches.map(m => {
        const thumbId = thumbIdFor(m);
        const t = thumbId ? data.thumbs?.[thumbId] : null;
        return t ? { ...m, thumbDataUrl: t.dataUrl, thumbW: t.w, thumbH: t.h } : m;
      }),
    };
  } catch {
    // Image fetching must never block a download.
    return reportData;
  }
}

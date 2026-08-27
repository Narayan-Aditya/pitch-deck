// Ported verbatim from the old brand-report-generator project's
// lib/creatorStats.js (generated 2026-08-12) — Open Grey Media's flagship
// creator's measured numbers, used on the brand-independent "Creator
// Analytics" slide. Re-generate from a fresh scrape when these go stale;
// this is a static snapshot, not a live call.
export const CREATOR_ANALYTICS = {
  instagram: {
    handle: "ji_nitinjoshi",
    followers: 1608723,
    reels: 654,
    avgLikes: 40570,
    avgComments: 429,
    engagementRatePct: 2.55,
  },
  youtube: {
    channel: "Nitin Joshi",
    totalViews: 166309379,
    totalVideos: 582,
    channelAvgViews: 285755,
    avgDurationMin: 111,
  },
};

export function compact(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(Math.round(n / 1e5) / 10).toString()}M`;
  if (abs >= 1e4) return `${(Math.round(n / 100) / 10).toString()}K`;
  return n.toLocaleString();
}

export function hoursMinutes(totalMinutes) {
  if (typeof totalMinutes !== "number" || !Number.isFinite(totalMinutes)) return "—";
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

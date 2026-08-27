// Between what this app stores about a report and what the deck expects.
//
// The deck came from a service that scraped its own Instagram audit and its own
// creator matches, so it reads snake_case shapes this app has never produced.
// Rather than reach into lib/deck/ and rewrite it — which would fork it from
// the layout-audit harness that keeps it honest — the two shapes meet here.
//
// The contract is smaller than either side's full object. slides.js reads six
// fields off the audit and four off each match, so this maps those and does not
// pretend the rest exists.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Engagement rate the deck's own way: (likes + comments) / followers, as a
 * percentage. Recomputed rather than taken from the stored value so it always
 * agrees with the avg_likes and avg_comments printed beside it on the slide. */
function engagementRatePct(followers, avgLikes, avgComments) {
  if (!followers || followers <= 0) return null;
  const interactions = (avgLikes || 0) + (avgComments || 0);
  if (!interactions) return null;
  return Math.round((interactions / followers) * 10000) / 100;
}

/** lib/instagramScrape.js output -> the instagramAnalytics shape.
 *
 * The report page collects those numbers a field at a time, so they arrive
 * already in that shape. The standalone pitch-deck flow gets them straight from
 * browse2api instead, and this is the one place that difference is resolved —
 * so toIgAudit() below stays the single description of what the slide reads. */
export function statsToAnalytics(stats) {
  if (!stats) return null;
  const videoPct = num(stats.video_reel_pct);
  return {
    handle: stats.username || "",
    followers: num(stats.followers),
    totalPosts: num(stats.total_posts),
    avgLikes: num(stats.avg_likes),
    avgComments: num(stats.avg_comments),
    postingFrequencyPerWeek: num(stats.posts_per_week),
    contentMix:
      videoPct == null
        ? []
        : [
            { type: "Photo", percentage: Math.round((100 - videoPct) * 10) / 10 },
            { type: "Video/Reel", percentage: Math.round(videoPct * 10) / 10 },
          ],
  };
}

/** report.instagramAnalytics -> the audit shape addInstagramSlide reads.
 *
 * Returns null when there is no handle and no follower count, which is what
 * buildDeck treats as "no usable audit" — it then swaps in the brand portrait
 * rather than printing a slide of blanks. */
export function toIgAudit(reportData, igProfile) {
  const ia = reportData?.instagramAnalytics;
  if (!ia) return null;

  const followers = num(ia.followers);
  const username = (ia.handle || "").replace(/^@/, "");
  if (!username && followers == null) return null;

  const avgLikes = num(ia.avgLikes);
  const avgComments = num(ia.avgComments);

  // contentMix is stored as [{type, percentage}]; splitContentMix() wants an
  // object and keys on the type name, so "Video/Reel" has to keep a word it
  // recognises.
  const contentMix = {};
  for (const entry of ia.contentMix || []) {
    const pct = num(entry?.percentage);
    if (pct == null) continue;
    const key = /video|reel/i.test(entry.type) ? "reel" : "photo";
    contentMix[key] = (contentMix[key] || 0) + pct;
  }

  return {
    platform: "instagram",
    profile: {
      username,
      followers,
      posts_count: num(ia.totalPosts),
      biography: igProfile?.biography || "",
    },
    performance: {
      avg_likes: avgLikes,
      avg_comments: avgComments,
      engagement_rate_percent:
        num(ia.engagementRatePct) ?? engagementRatePct(followers, avgLikes, avgComments),
      posts_per_week: num(ia.postingFrequencyPerWeek),
      // The audit slide prints "Based on the N most recent posts". This app's
      // numbers are typed in or imported wholesale rather than sampled, so
      // there is no N to claim and the slide drops the line.
      sample_size: null,
    },
    content_mix: Object.keys(contentMix).length ? contentMix : null,
  };
}

/** This app's flat creator-match list -> the deck's per-platform shape.
 *
 * `matched` is carried through rather than assumed true: the track-record
 * slide's headline claims these are relevant to *this* brand, and the matcher
 * tops its results up with the creator's most-engaged content when it cannot
 * find enough real matches. Padding must not be counted as proof. */
export function toContentMatches(creatorMatches, limits = { instagram: 3, youtube: 2 }) {
  const all = Array.isArray(creatorMatches) ? creatorMatches : [];

  const isVideo = (m) =>
    m?.platform === "youtube" || /youtube\.com|youtu\.be/i.test(m?.url || "");

  const posts = all
    .filter((m) => m?.url && !isVideo(m))
    .slice(0, limits.instagram)
    .map((m) => ({
      url: m.url,
      caption: m.caption || m.captionHead || m.title || "",
      curatedBrand: m.curatedBrand || m.brand || null,
      likes: num(m.likes ?? m.likeCount ?? m.likesCount),
      comments: num(m.comments ?? m.commentCount ?? m.commentsCount),
      matched: m.matched !== false,
    }));

  const videos = all
    .filter((m) => m?.url && isVideo(m))
    .slice(0, limits.youtube)
    .map((m) => ({
      url: m.url,
      title: m.title || "",
      curatedBrand: m.curatedBrand || m.brand || null,
      view_count: num(m.viewCount ?? m.views ?? m.view_count),
      matched: m.matched !== false,
    }));

  const genuine = (items) => items.filter((i) => i.matched).length;

  return {
    instagram: { matched_count: genuine(posts), posts },
    youtube: { matched_count: genuine(videos), videos },
  };
}

/** Everything buildPitchDeck() needs, from what the report page holds.
 *
 * `brand` is the scraped object from /api/brand when there is one. Without it
 * the deck still builds — pickPalette seeds off the brand name and the copy
 * falls back — but the cover, the reach line and the closing ask all print
 * "Your Brand", so the caller should treat a missing scrape as worth fixing
 * rather than as normal. */
export function toDeckArgs({ report, reportData, brand, offerType = "both" }) {
  return {
    brand: brand || { name: report?.brandName || "", url: report?.brandUrl || "" },
    offerType,
    igAudit: toIgAudit(reportData, reportData?.igProfile),
    contentMatches: toContentMatches(reportData?.creatorMatches),
  };
}

// Instagram profile stats via browse2api's hosted Instagram Profile & Posts
// API — the replacement for driving Instagram's own private endpoints by hand
// with a scraped session cookie.
//
// One POST, one JSON payload: a profile plus every post since a date we pick.
// No cookie jar, no warm-up navigation, no throttle circuit breaker — that
// machinery existed only because the old approach was a real logged-in
// session pretending to be a browser. browse2api takes on that risk (and the
// ToS exposure that came with it) on its own infrastructure; this module just
// calls a REST endpoint with an API key.
//
// See browse2api-Instagram-API-Reference.pdf at the repo root for the full
// spec this was built from.
const API_URL = 'https://skills.browse2api.com/v1/instagram/profile';

// The API returns every post back to `since`, not a fixed page size, so this
// module asks for a wide-enough window and then caps how many of the most
// recent posts feed the engagement averages — matching the sample size the
// old scraper used per lookup.
const SINCE_WINDOW_DAYS = 90;
const POSTS_LIMIT = 12;

// Docs: "a call typically completes in 20-60s ... set your client timeout to
// >=120s". The Next.js route's own maxDuration is the harder ceiling here, so
// this stays a few seconds under that instead of the full 120s the docs ask
// for — a slow call fails with a clear timeout message rather than the
// function getting killed mid-request.
const TIMEOUT_MS = 55000;

function sinceDateString(daysAgo) {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}

async function callBrowse2Api(username, since) {
  const apiKey = process.env.BROWSE2API_KEY;
  if (!apiKey) {
    throw new Error('no Instagram API key is saved on the server (set BROWSE2API_KEY, then redeploy)');
  }

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, since }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError') {
      throw new Error('the Instagram lookup took too long to respond');
    }
    throw err;
  }

  if (!res.ok) {
    const requestId = res.headers.get('x-request-id');
    const body = await res.json().catch(() => null);
    const detail = body?.error || body?.message;

    switch (res.status) {
      case 401:
        throw new Error('the saved Instagram API key is missing or invalid');
      case 403:
        throw new Error('the saved Instagram API key has been disabled');
      case 402:
        throw new Error('the Instagram API quota has been used up for this month');
      case 404:
        throw new Error(`there's no Instagram profile called @${username}`);
      case 502:
        throw new Error("Instagram's data source is temporarily unavailable — try again shortly");
      default: {
        const suffix = requestId ? ` (request ${requestId})` : '';
        throw new Error(detail || `the Instagram lookup failed with HTTP ${res.status}${suffix}`);
      }
    }
  }

  return res.json();
}

// type "reel" or "video" counts as video; "photo" and "carousel" don't.
function isVideoPost(post) {
  return post.type === 'reel' || post.type === 'video';
}

function avg(nums) {
  const vals = nums.filter(n => typeof n === 'number');
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export async function scrapeInstagram(username) {
  const since = sinceDateString(SINCE_WINDOW_DAYS);
  const data = await callBrowse2Api(username, since);

  const profile = data?.profile;
  if (!profile) throw new Error('Instagram returned no profile data');

  // Most-recent-first, capped, so accounts posting daily don't skew the
  // engagement average with three months of history.
  const posts = (data?.posts || [])
    .slice()
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at))
    .slice(0, POSTS_LIMIT);

  const likes = posts.map(p => p.like_count);
  const comments = posts.map(p => p.comment_count);
  const videoFlags = posts.map(isVideoPost);
  const timestamps = posts
    .map(p => (p.posted_at ? Date.parse(p.posted_at) / 1000 : null))
    .filter(Boolean);

  const videoReelPct = videoFlags.length
    ? Math.round((100 * videoFlags.filter(Boolean).length / videoFlags.length) * 10) / 10
    : null;

  let postsPerWeek = null;
  if (timestamps.length >= 2) {
    const spanDays = Math.max((Math.max(...timestamps) - Math.min(...timestamps)) / 86400, 1);
    postsPerWeek = Math.round(((timestamps.length - 1) / spanDays * 7) * 100) / 100;
  }

  return {
    username: profile.username || username,
    full_name: profile.full_name || '',
    // browse2api's profile object doesn't carry bio/category — these stay
    // empty and the report page's grounding step degrades gracefully without
    // them (see the check in lib/openaiGenerate.js).
    biography: '',
    ig_category: '',
    external_url: profile.external_url || '',
    followers: profile.followers ?? null,
    following: profile.following ?? null,
    total_posts: profile.posts_count ?? null,
    avg_likes: avg(likes),
    avg_comments: avg(comments),
    video_reel_pct: videoReelPct,
    posts_per_week: postsPerWeek,
    sampled_post_count: posts.length,
    is_private: !!profile.is_private,
    scraped_at: new Date().toISOString(),
  };
}

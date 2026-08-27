// Apify fallback for the Instagram profile+posts lookup.
//
// browse2api (lib/instagramScrape.js) is the primary client and stays that way
// — it is cheaper per call and answers in one hop. But it goes down, runs out of
// monthly quota, gets its key disabled, and occasionally returns an empty
// profile for an account that plainly exists. When that happens the deck has
// nothing to put on the Instagram slide, so this re-asks Apify's hosted profile
// scraper for the same thing.
//
// Deliberately narrow: profile plus the most recent posts, which is the whole
// Instagram scope of this app. No full history, no follower lists — every extra
// field is another actor run to pay for.
//
// The return shape is browse2api's raw shape, NOT a normalised one. That is the
// whole point: scrapeInstagram()'s averaging, content-mix and posting-frequency
// maths keep running off a single path and never learn which backend served the
// request.

// run-sync-get-dataset-items runs the actor and hands back its dataset in one
// call, so there is no run id to poll. The tilde is Apify's URL spelling of
// `user/actor`.
const DEFAULT_ACTOR = 'apify~instagram-profile-scraper';
const BASE_URL = 'https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items';
const ACTOR_TIMEOUT = 120;                     // seconds Apify may spend on the run
const CLIENT_TIMEOUT_MS = (ACTOR_TIMEOUT + 40) * 1000; // wait longer than the run, or we abandon one that succeeded

/** APIFY_IG_TOKEN wins so the scraper can be billed to a different account from
 * anything else using Apify, but APIFY_TOKEN alone is enough. */
function token() {
  return process.env.APIFY_IG_TOKEN || process.env.APIFY_TOKEN || null;
}

/** Whether a fallback is even possible.
 *
 * Checked before browse2api's error is swallowed: with no token there is
 * nothing to fall back to, and the caller should see the original failure
 * rather than a second one about a service the operator never set up. */
export function isConfigured() {
  return Boolean(token());
}

function actor() {
  return process.env.APIFY_IG_ACTOR || DEFAULT_ACTOR;
}

async function errorDetail(res) {
  try {
    const body = await res.json();
    const error = body?.error;
    if (error && typeof error === 'object') return error.message || JSON.stringify(error).slice(0, 200);
    return error || JSON.stringify(body).slice(0, 200);
  } catch {
    return `HTTP ${res.status}`;
  }
}

// ---------------------------------------------------------------------------
// Field mapping. Apify's actor uses its own camelCase names; browse2api's are
// what the rest of this app reads. Everything here closes that gap and nothing
// else.
// ---------------------------------------------------------------------------

/** browse2api's vocabulary: reel / video / image / sidecar.
 *
 * productType === 'clips' is the only reliable reel marker — a reel's `type` is
 * just "Video", the same as a feed video, and the content mix splits the two. */
function postType(post) {
  if (String(post.productType || '').toLowerCase() === 'clips') return 'reel';
  const raw = String(post.type || '').toLowerCase();
  return ['video', 'sidecar', 'image'].includes(raw) ? raw : raw || 'unknown';
}

/** Apify returns -1, not null, for a count Instagram is hiding. Passed through,
 * it would subtract from an average. */
function count(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function mapProfile(item) {
  return {
    username: item.username,
    full_name: item.fullName,
    biography: item.biography || '',
    followers: item.followersCount,
    following: item.followsCount,
    posts_count: item.postsCount,
    is_verified: Boolean(item.verified),
    is_private: Boolean(item.private),
    profile_pic_url: item.profilePicUrlHD || item.profilePicUrl,
    external_url: item.externalUrl,
    category: item.businessCategoryName,
  };
}

function mapPost(post) {
  const views = post.videoPlayCount ?? post.videoViewCount ?? null;
  return {
    shortcode: post.shortCode,
    type: postType(post),
    posted_at: post.timestamp,
    like_count: count(post.likesCount),
    comment_count: count(post.commentsCount),
    view_count: views === null ? null : count(views),
    caption: post.caption || '',
  };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** Profile + the most recent posts, in browse2api's response shape.
 *
 * The actor decides how many recent posts it attaches (about a dozen); there is
 * no "give me N" input, so the slice happens here. A private or nonexistent
 * account comes back as an empty dataset rather than an error — the caller
 * checks `profile`. */
export async function fetchViaApify(username, limit = 12) {
  const key = token();
  if (!key) throw new Error('no Apify token is configured, so there is no fallback to try');

  const url = new URL(BASE_URL.replace('{actor}', actor()));
  url.searchParams.set('token', key);
  url.searchParams.set('timeout', String(ACTOR_TIMEOUT));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [String(username).replace(/^@/, '')] }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      err?.name === 'AbortError'
        ? 'the Apify fallback took too long to respond'
        : `the Apify fallback could not be reached — ${err.message || err}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`the Apify token is invalid or has no access to the scraper (${await errorDetail(res)})`);
  }
  if (res.status === 402) {
    throw new Error(`the Apify account's usage limit is exhausted (${await errorDetail(res)})`);
  }
  if (res.status === 404) {
    throw new Error(`the Apify actor '${actor()}' was not found (${await errorDetail(res)})`);
  }
  if (!res.ok) {
    throw new Error(`the Apify run failed — ${await errorDetail(res)}`);
  }

  let items;
  try {
    items = await res.json();
  } catch {
    throw new Error("the Apify fallback's response was not JSON");
  }
  if (!Array.isArray(items) || !items.length) {
    return { profile: null, posts: [], source: 'apify' };
  }

  const item = items[0];
  // An actor-level failure is reported as a dataset row, not an HTTP status.
  if (item.error) {
    throw new Error(`Apify reported: ${item.errorDescription || item.error}`);
  }

  const posts = (item.latestPosts || [])
    .map(mapPost)
    .sort((a, b) => String(b.posted_at || '').localeCompare(String(a.posted_at || '')))
    .slice(0, Math.max(limit, 1));

  return { profile: mapProfile(item), posts, source: 'apify' };
}

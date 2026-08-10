// Instagram profile stats over plain HTTP — the serverless-safe replacement
// for shelling out to ig_data.py.
//
// The Python scraper drives Playwright, but the browser was only ever there to
// supply the instagram.com origin so its page.evaluate() fetches carried the
// session cookie. The endpoints themselves are ordinary GETs, so sending the
// cookies and headers directly does the same job without a ~300MB Chromium
// that could never fit in a function bundle anyway.
//
// Two things a browser does implicitly have to be done by hand here, and
// missing either one gets you a 200 that is actually an error page:
//
//   1. Warm up on https://www.instagram.com/ before anything else. That
//      response sets `rur` (and friends), and the profile page does not render
//      without it — this is what ig_data.py's "land on the origin once" step
//      (its line 162) was quietly buying. Sending only `sessionid` looks
//      logged-in enough to avoid the login wall, yet still returns
//      "pageID":"httpErrorPage" with no user id anywhere in it.
//   2. Send a full Chrome header set. Instagram serves a different, emptier
//      page to clients it doesn't recognise as a browser, so the UA and the
//      sec-ch-ua / sec-fetch-* group are load-bearing, not decoration.
//
// ig_data.py is still the tool for bulk runs (--file ids.txt --daily 50): it
// paces itself between accounts and writes stats.json, which /api/ig-stats
// reads locally. This module is the single-handle, on-demand path.
//
// ToS note, same as the Python script: these are Instagram's private endpoints
// driven by a real logged-in session. That is against their terms and carries
// genuine checkpoint/ban risk on the account whose sessionid is used — more so
// from a datacenter IP than from a laptop.
const IG_APP_ID = '936619743392459';
const POSTS_LIMIT = 12;
const TIMEOUT_MS = 15000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CHROME_BASE = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

const NAV_HEADERS = {
  ...CHROME_BASE,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

const USER_ID_PATTERNS = [
  /"profile_id":"(\d+)"/,
  /"user_id":"(\d+)"/,
  /profilePage_(\d+)/,
];

// One lookup costs four requests (warm-up, profile page, profile info, feed).
// When Instagram starts throttling, the natural human response is to click
// "Get latest" again, which spends another four against a session already in
// trouble — and the thing at risk is a real logged-in account, not an API key.
// So a throttle response puts the whole module on ice: further calls fail
// instantly without touching the network until the window passes.
//
// Module scope, so it holds for the life of a warm serverless instance and for
// as long as the dev server is up. It is a brake on the common case, not a
// guarantee — a cold instance starts with a clear slate.
const THROTTLE_COOLDOWN_MS = 10 * 60 * 1000;
let throttledUntil = 0;

const THROTTLE_MESSAGE = 'Instagram is throttling this login — wait several minutes before trying again';

function markThrottled() {
  throttledUntil = Date.now() + THROTTLE_COOLDOWN_MS;
}

// Minimal cookie jar. Instagram hands back cookies the later requests need, so
// they have to be carried forward the way a browser would.
function createJar(sessionId) {
  const jar = new Map([['sessionid', sessionId]]);
  return {
    header: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    get: (k) => jar.get(k),
    harvest(res) {
      for (const cookie of res.headers.getSetCookie?.() || []) {
        const [pair] = cookie.split(';');
        const idx = pair.indexOf('=');
        if (idx <= 0) continue;
        const key = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        // Instagram clears cookies by setting them empty; don't let that
        // overwrite a good sessionid.
        if (value && value !== '""') jar.set(key, value);
      }
    },
  };
}

async function igFetch(jar, url, headers) {
  let res;
  try {
    res = await fetch(url, {
      headers: { ...headers, Cookie: jar.header() },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });
  } catch (err) {
    const cause = err?.cause?.message || err?.message || '';
    // Instagram does not answer a throttled client with a clean 429. It bounces
    // it around a redirect chain until fetch gives up, which surfaces as
    // "redirect count exceeded" — that reads like a bug in this code and is
    // not one. Seen reliably after a burst of requests on one session.
    if (/redirect count exceeded/i.test(cause)) {
      markThrottled();
      throw new Error(THROTTLE_MESSAGE);
    }
    if (err?.name === 'TimeoutError' || /timeout/i.test(cause)) {
      throw new Error('Instagram took too long to respond');
    }
    throw err;
  }
  jar.harvest(res);
  return res;
}

function apiHeaders(jar) {
  const csrf = jar.get('csrftoken');
  return {
    ...CHROME_BASE,
    'Accept': '*/*',
    'X-IG-App-ID': IG_APP_ID,
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Referer': 'https://www.instagram.com/',
    ...(csrf ? { 'X-CSRFToken': csrf } : {}),
  };
}

async function warmUp(jar) {
  await igFetch(jar, 'https://www.instagram.com/', { ...NAV_HEADERS, 'Sec-Fetch-Site': 'none' });
}

// Resolving the numeric id from the profile HTML, then calling
// /users/<id>/info/, is deliberate: the older web_profile_info endpoint 400s
// for BUSINESS accounts, which is most brands this tool is pointed at.
async function resolveUserId(jar, username) {
  const res = await igFetch(jar, `https://www.instagram.com/${username}/`, {
    ...NAV_HEADERS,
    'Sec-Fetch-Site': 'same-origin',
    'Referer': 'https://www.instagram.com/',
  });
  const html = await res.text();

  for (const pattern of USER_ID_PATTERNS) {
    const m = html.match(pattern);
    if (m) return m[1];
  }
  if (/Sorry, this page isn'?t available/i.test(html) || /page isn&#039;t available/.test(html)) {
    throw new Error(`there's no Instagram profile called @${username}`);
  }
  if (res.status === 429) {
    markThrottled();
    throw new Error(THROTTLE_MESSAGE);
  }
  throw new Error('Instagram refused the request — the saved login may have expired, or it is blocking the server');
}

async function fetchProfile(jar, userId) {
  const res = await igFetch(jar, `https://www.instagram.com/api/v1/users/${userId}/info/`, apiHeaders(jar));
  if (res.status === 429) { markThrottled(); throw new Error(THROTTLE_MESSAGE); }
  if (!res.ok) throw new Error(`Instagram returned HTTP ${res.status} for that profile`);

  const json = await res.json().catch(() => null);
  const user = json?.user;
  if (!user) throw new Error('Instagram returned no profile data');
  return user;
}

async function fetchPosts(jar, userId, limit = POSTS_LIMIT) {
  const res = await igFetch(
    jar,
    `https://www.instagram.com/api/v1/feed/user/${userId}/?count=${limit}`,
    apiHeaders(jar)
  );
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const json = await res.json().catch(() => null);
  return (json?.items || []).slice(0, limit);
}

// media_type 2 is video; product_type "clips" is a Reel. Carousels
// (media_type 8) count as photo unless Instagram marks them otherwise.
function isVideoPost(item) {
  return item.media_type === 2 || item.product_type === 'clips';
}

function avg(nums) {
  const vals = nums.filter(n => typeof n === 'number');
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export async function scrapeInstagram(username) {
  const sessionId = process.env.IG_SESSIONID;
  if (!sessionId) {
    throw new Error('no Instagram login is saved on the server (set IG_SESSIONID, then redeploy)');
  }

  const waitMs = throttledUntil - Date.now();
  if (waitMs > 0) {
    const mins = Math.ceil(waitMs / 60000);
    throw new Error(
      `Instagram is throttling this login — waiting ${mins} more minute${mins === 1 ? '' : 's'} before trying again`
    );
  }

  const jar = createJar(sessionId);
  await warmUp(jar);

  const userId = await resolveUserId(jar, username);
  const user = await fetchProfile(jar, userId);

  // A private account still reports follower/post counts, but its feed is
  // walled — averaging over zero posts would silently report 0 engagement,
  // which is worse on a pitch deck than an obviously absent number.
  let posts = [];
  if (!user.is_private) {
    try {
      posts = await fetchPosts(jar, userId);
    } catch {
      // Profile numbers are still worth returning without the post sample.
    }
  }

  const likes = posts.map(p => p.like_count);
  const comments = posts.map(p => p.comment_count);
  const videoFlags = posts.map(isVideoPost);
  const timestamps = posts.map(p => p.taken_at).filter(Boolean);

  const videoReelPct = videoFlags.length
    ? Math.round((100 * videoFlags.filter(Boolean).length / videoFlags.length) * 10) / 10
    : null;

  let postsPerWeek = null;
  if (timestamps.length >= 2) {
    const spanDays = Math.max((Math.max(...timestamps) - Math.min(...timestamps)) / 86400, 1);
    postsPerWeek = Math.round(((timestamps.length - 1) / spanDays * 7) * 100) / 100;
  }

  return {
    username: user.username || username,
    full_name: user.full_name || '',
    // Profile text and category ground the brand summary for free — see the
    // grounding note in lib/openaiGenerate.js.
    biography: user.biography || '',
    ig_category: user.category || '',
    external_url: user.external_url || '',
    followers: user.follower_count ?? null,
    following: user.following_count ?? null,
    total_posts: user.media_count ?? null,
    avg_likes: avg(likes),
    avg_comments: avg(comments),
    video_reel_pct: videoReelPct,
    posts_per_week: postsPerWeek,
    sampled_post_count: posts.length,
    is_private: !!user.is_private,
    scraped_at: new Date().toISOString(),
  };
}

// Turns the scraped creator dumps into the small, committed module the deck
// reads: lib/creatorStats.js.
//
// Why generate instead of reading the JSON at runtime: `nitin josi data/` is
// 1.9MB and the deck is built in the BROWSER (lib/buildPptx.js runs pptxgenjs
// client-side). Shipping two megabytes of scrape to every visitor to print
// twelve numbers that are identical on every deck would be absurd. These
// numbers only change when the dumps are re-scraped, and nothing in the repo
// re-scrapes them — so this runs by hand:
//
//     node scripts/build-creator-stats.mjs
//
// Re-run it after refreshing either file in `nitin josi data/`, and commit the
// regenerated lib/creatorStats.js alongside them.
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const CREATOR_DIR = 'nitin josi data';   // folder name has a space — always path.join
const IG_FILE = 'ji_nitinjoshi_instagram.json';
const YT_FILE = 'jinitinjoshi_youtube.json';
const OWNER = 'ji_nitinjoshi';
const OUT = path.join('lib', 'creatorStats.js');

// The Instagram dump is post-level only — it carries no profile record, so the
// follower count cannot be derived from it and is supplied by hand. Confirmed
// figure, 2026-08-12. Everything downstream (engagement rate) keys off this, so
// update it here rather than patching percentages.
const IG_FOLLOWERS = 1608723;

// Instagram usernames don't decompose into brand names reliably —
// "iciciprulifeofficial" is not "Iciciprulifeofficial", and stripping a
// trailing "official" still leaves "Icicipru". These are the accounts that
// actually appear in the collab data; anything unlisted falls back to the
// mechanical prettifier below, and every value is editable per report anyway.
const IG_BRAND_LABELS = {
  flipkartgrocery_: 'Flipkart Grocery',
  iciciprulifeofficial: 'ICICI Prudential Life',
  zohocreator: 'Zoho Creator',
  zohoworkplace: 'Zoho Workplace',
  indiapoco: 'POCO India',
  precizehq: 'Precize',
  xlncperfumeryind: 'XLNC Perfumery',
  livguardenergy: 'Livguard',
  thehouseofabhinandanlodha: 'House of Abhinandan Lodha',
  lntfinance: 'L&T Finance',
  vibusinessindia: 'VI Business',
  godrejproperties_mumbai: 'Godrej Properties',
  etmoney_official: 'ET Money',
  m3mindiapvtltd: 'M3M India',
  muthootfincorpone: 'Muthoot FinCorp ONE',
  ackoindia: 'ACKO',
  mgmuniversity: 'MGM University',
  manipalcigna_healthinsurance: 'ManipalCigna Health Insurance',
  asblindia: 'ASBL',
  flipkarttechspert: 'Flipkart Techspert',
  amarujala: 'Amar Ujala',
  msmeforbharat: 'MSME for Bharat',
  thesunflowerseedsco: 'The Sunflower Seeds Co',
  merchgarage: 'Merch Garage',
  unmesscatering: 'Unmess Catering',
};

function prettifyHandle(username) {
  if (IG_BRAND_LABELS[username]) return IG_BRAND_LABELS[username];
  return username
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function readJsonArray(file) {
  const raw = await readFile(path.join(process.cwd(), CREATOR_DIR, file), 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

const sum = nums => nums.reduce((a, b) => a + b, 0);
const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------
function instagramAnalytics(posts) {
  // Reels only, and only this account's. 8 of the 677 records belong to other
  // accounts (Nitin tagged in their posts) and 20 are stills — averaging a
  // photo carousel in with 654 reels would understate the reel numbers, which
  // are the ones the pitch is actually about.
  const reels = posts.filter(p => p.ownerUsername === OWNER && p.type === 'Video');

  // likesCount is -1 when the owner has hidden likes on a post; that is "no
  // data", not "zero likes", and averaging it in would drag the mean down.
  const likes = reels.map(p => p.likesCount).filter(n => typeof n === 'number' && n >= 0);
  const comments = reels.map(p => p.commentsCount).filter(n => typeof n === 'number' && n >= 0);

  const avgLikes = Math.round(sum(likes) / likes.length);
  const avgComments = Math.round(sum(comments) / comments.length);

  const times = reels.map(p => +new Date(p.timestamp)).filter(Boolean).sort((a, b) => a - b);
  const spanDays = Math.max((times[times.length - 1] - times[0]) / 86400000, 1);

  return {
    handle: OWNER,
    followers: IG_FOLLOWERS,
    reels: reels.length,
    avgLikes,
    avgComments,
    // Same formula as the prospect's slide (app/report/[id]/page.js
    // buildReportData) so the two Instagram slides can be read against each
    // other. Mean-based, so one breakout reel lifts it — the median reel is
    // reported alongside for anyone who asks.
    engagementRatePct: round2((100 * (avgLikes + avgComments)) / IG_FOLLOWERS),
    medianLikes: [...likes].sort((a, b) => a - b)[Math.floor(likes.length / 2)],
    bestReelLikes: Math.max(...likes),
    totalLikes: sum(likes),
    totalComments: sum(comments),
    reelsPerWeek: round1((reels.length / spanDays) * 7),
    firstPostAt: new Date(times[0]).toISOString(),
    lastPostAt: new Date(times[times.length - 1]).toISOString(),
  };
}

// A brand collab is not guesswork here: Instagram itself marks them. `sponsors`
// is the declared paid-partnership label, `coauthorProducers` is the collab
// post co-author. Captions that merely name a brand ("@zomato") are case
// studies, not collabs, and are deliberately not counted.
function instagramCollabs(posts) {
  const rows = [];
  for (const p of posts) {
    if (p.ownerUsername !== OWNER) continue;

    const partners = [
      ...(p.sponsors || []),
      ...(p.coauthorProducers || []),
    ]
      .map(x => x?.username)
      .filter(u => u && u !== OWNER);

    const unique = [...new Set(partners)];
    if (!unique.length) continue;   // co-authored with only himself — not a collab

    const likes = p.likesCount >= 0 ? p.likesCount : null;
    rows.push({
      platform: 'instagram',
      brand: unique.map(prettifyHandle).join(' × '),
      handles: unique,
      url: p.url,
      caption: String(p.caption || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      likes,
      comments: p.commentsCount ?? null,
      postedAt: p.timestamp,
      // A declared sponsor is a paid partnership; a bare co-author is a collab.
      // Worth keeping, because "paid partnership" is the stronger proof.
      sponsored: Boolean(p.sponsors?.length),
    });
  }
  // Hidden-likes posts sort last rather than as zero.
  return rows.sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1));
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------
function youtubeAnalytics(videos) {
  // Channel-level figures are repeated on every record; they describe the whole
  // channel (582 videos), while the averages below cover only the 31 scraped.
  const c = videos[0] || {};
  const views = videos.map(v => v.viewCount).filter(n => typeof n === 'number');
  const likes = videos.map(v => v.likes).filter(n => typeof n === 'number');
  const comments = videos.map(v => v.commentsCount).filter(n => typeof n === 'number');
  const secs = videos.map(v => v.durationSeconds).filter(n => typeof n === 'number');

  const times = videos.map(v => +new Date(v.date)).filter(Boolean).sort((a, b) => a - b);
  const spanDays = Math.max((times[times.length - 1] - times[0]) / 86400000, 1);

  const totalViews = c.channelTotalViews ?? null;
  const totalVideos = c.channelTotalVideos ?? null;

  return {
    channel: c.channelName || 'Nitin Joshi',
    url: c.channelUrl || '',
    subscribers: c.numberOfSubscribers ?? null,
    totalViews,
    totalVideos,
    sampledVideos: videos.length,

    // Two different averages, and the difference is large enough that the names
    // have to say which is which. `channelAvgViews` covers all 582 videos the
    // channel has ever published, Shorts included, and comes out around 286K.
    // `sampledAvgViews` covers only the 31 long-form episodes in the dump and
    // comes out around 22K. Neither is wrong; a slide labelled just "avg views"
    // would be.
    channelAvgViews: totalViews && totalVideos ? Math.round(totalViews / totalVideos) : null,
    sampledAvgViews: Math.round(sum(views) / views.length),

    avgLikes: Math.round(sum(likes) / likes.length),
    avgComments: Math.round(sum(comments) / comments.length),
    avgDurationMin: Math.round(sum(secs) / secs.length / 60),
    uploadsPerMonth: round1((videos.length / spanDays) * 30),
  };
}

// Every episode description opens the same way — "we sit down with <Person>,
// the founder of <Brand>, who…" — so the company behind each guest is in the
// text rather than in a field. Nothing in the YouTube dump marks a sponsor
// (the only link on all 31 videos is Nitin's own linktree), so these are
// "brands featured on the podcast", not paid placements, and the slide says so.
// Deliberately NOT case-insensitive: the capture leans on the brand's words
// being Capitalised to know where the name ends. With /i, "Founder of Fixderma
// and the newest Shark on Shark Tank" captured "Fixderma and the newest",
// because [A-Z] then matched "and" too. So the prefix spells out its own
// casing instead.
const FOUNDER_RE = new RegExp(
  String.raw`\b(?:[Tt]he\s+)?(?:[Cc]o-?)?[Ff]ounder` +
  String.raw`(?:\s*(?:&|and)\s*(?:[Cc]o-?[Ff]ounder|CEO|COO|CTO|MD|[Mm]anaging\s+[Dd]irector))?` +
  String.raw`\s+of\s+` +
  String.raw`([A-Z][A-Za-z0-9&'.\-]*(?:\s+[A-Z][A-Za-z0-9&'.\-]*){0,3})`
);

// Words that follow a brand name often enough to be swept up by the capture.
const TRAILING_NOISE = /\s+(?:who|which|that|the|a|an|one|and|in|is|was|has|had|he|she|they)$/i;

function brandFromDescription(description) {
  const m = String(description || '').match(FOUNDER_RE);
  if (!m) return null;
  let brand = m[1].trim().replace(/[,.]$/, '');
  // Strip a trailing connective the greedy capture may have absorbed, e.g.
  // "Chai Sutta Bar a" → "Chai Sutta Bar".
  let prev;
  do { prev = brand; brand = brand.replace(TRAILING_NOISE, ''); } while (brand !== prev);
  return brand.length > 1 ? brand : null;
}

function youtubeBrandEpisodes(videos) {
  return videos
    .map(v => {
      const brand = brandFromDescription(v.description);
      if (!brand) return null;
      return {
        platform: 'youtube',
        brand,
        id: v.id,
        url: v.url,
        title: v.title || '',
        views: v.viewCount ?? null,
        likes: v.likes ?? null,
        comments: v.commentsCount ?? null,
        durationLabel: String(v.duration || '').replace(/^00:/, ''),
        publishedAt: v.date,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
}

// ---------------------------------------------------------------------------
function render({ analytics, igCollabs, ytEpisodes }) {
  const json = obj => JSON.stringify(obj, null, 2).replace(/\n/g, '\n');
  return `// GENERATED FILE — do not edit by hand.
//
// Written by scripts/build-creator-stats.mjs from the dumps in "nitin josi
// data/". Re-run that script after re-scraping, and commit the result:
//
//     node scripts/build-creator-stats.mjs
//
// The deck is built in the browser, so these pre-computed figures are what
// lib/buildPptx.js reads instead of parsing 1.9MB of scrape per download.
// Generated ${new Date().toISOString().slice(0, 10)}.

export const CREATOR_ANALYTICS = ${json(analytics)};

// Every collab Instagram itself marked, and every podcast episode whose guest
// runs a named company — best-performing first. The report page seeds its
// editable brand-collab fields from the top three of each; the rest are here so
// swapping one out is a pick from a list rather than a hunt through the dump.
export const CREATOR_IG_COLLABS = ${json(igCollabs)};

export const CREATOR_YT_BRAND_EPISODES = ${json(ytEpisodes)};

export const CREATOR_COLLAB_DEFAULTS = {
  instagram: CREATOR_IG_COLLABS.slice(0, 3),
  youtube: CREATOR_YT_BRAND_EPISODES.slice(0, 3),
};
`;
}

async function main() {
  const [igRaw, ytRaw] = await Promise.all([readJsonArray(IG_FILE), readJsonArray(YT_FILE)]);

  const analytics = {
    instagram: instagramAnalytics(igRaw),
    youtube: youtubeAnalytics(ytRaw),
  };
  const igCollabs = instagramCollabs(igRaw);
  const ytEpisodes = youtubeBrandEpisodes(ytRaw);

  if (!igCollabs.length) throw new Error('no Instagram collabs found — did the dump lose sponsors/coauthorProducers?');
  if (!ytEpisodes.length) throw new Error('no YouTube brand episodes matched — check FOUNDER_RE against the descriptions');

  await writeFile(OUT, render({ analytics, igCollabs, ytEpisodes }), 'utf8');

  const ig = analytics.instagram;
  const yt = analytics.youtube;
  console.log(`Wrote ${OUT}`);
  console.log(`  Instagram  ${ig.reels} reels · ${ig.followers.toLocaleString('en-IN')} followers · `
    + `avg ${ig.avgLikes.toLocaleString('en-IN')} likes · ${ig.engagementRatePct}% engagement`);
  console.log(`  YouTube    ${yt.totalVideos} videos · ${yt.subscribers.toLocaleString('en-IN')} subs · `
    + `${yt.totalViews.toLocaleString('en-IN')} lifetime views`);
  console.log(`  Collabs    ${igCollabs.length} Instagram · ${ytEpisodes.length} YouTube brand episodes`);
  console.log(`  Defaults   IG: ${igCollabs.slice(0, 3).map(c => c.brand).join(', ')}`);
  console.log(`             YT: ${ytEpisodes.slice(0, 3).map(c => c.brand).join(', ')}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

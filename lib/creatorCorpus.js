// Server-only loader for the creator's scraped back catalogue.
//
// Unlike stats.json (gitignored, written by a local scraper), this data folder
// IS committed and ships with the deploy — so this route works in production.
// Don't "fix" that by ignoring the folder.
import { readFile } from 'fs/promises';
import path from 'path';
import { tokenize, canonToken } from './relevance.js';

export const CREATOR_DIR = 'nitin josi data'; // folder name has a space and a typo — always path.join
const YT_FILE = 'jinitinjoshi_youtube.json';
const IG_FILE = 'ji_nitinjoshi_instagram.json';
const OWNER = 'ji_nitinjoshi';
const DESC_HEAD_CHARS = 900;   // past this it's linktree/Spotify boilerplate on every video
const CAPTION_HEAD_CHARS = 200; // median caption is ~148 chars — the hook is the whole post

let cache = null; // memoised: the 1.8MB parse + IDF build happens once per process

async function readJsonArray(file) {
  try {
    const raw = await readFile(path.join(process.cwd(), CREATOR_DIR, file), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    if (err.code === 'ENOENT') return null; // missing data is a state, not an error
    throw err;
  }
}

function normaliseYouTube(v) {
  const descHead = String(v.description || '').slice(0, DESC_HEAD_CHARS);
  const tagsText = (v.tags || []).join(' ').toLowerCase();
  const titleTokens = tokenSetOf(v.title);
  const tagTokens = tokenSetOf((v.tags || []).join(' '));
  const hashtagTokens = tokenSetOf((v.hashtags || []).join(' '));
  const descTokens = tokenSetOf(descHead);
  return {
    platform: 'youtube',
    id: v.id,
    url: v.url,
    title: v.title || '',
    tags: v.tags || [],
    hashtags: v.hashtags || [],
    descHead,
    tagsText,
    titleTokens, tagTokens, hashtagTokens, descTokens,
    allTokens: new Set([...titleTokens, ...tagTokens, ...hashtagTokens, ...descTokens]),
    views: v.viewCount ?? null,
    likes: v.likes ?? null,
    comments: v.commentsCount ?? null,
    publishedAt: v.date,
    durationLabel: (v.duration || '').replace(/^00:/, ''),
    thumbTiers: v.thumbnails || null,
  };
}

function normaliseInstagram(p) {
  const caption = String(p.caption || '');
  const head = caption.slice(0, CAPTION_HEAD_CHARS);
  const rest = caption.slice(CAPTION_HEAD_CHARS);
  const mentions = (caption.match(/@[A-Za-z0-9._]+/g) || []).map(m => m.slice(1));
  const hashtagTokens = tokenSetOf((p.hashtags || []).join(' '));
  const captionHeadTokens = tokenSetOf(head);
  const captionRestTokens = tokenSetOf(rest);
  const mentionTokens = new Set(mentions.map(canonToken).filter(Boolean));
  return {
    platform: 'instagram',
    id: p.shortCode || p.id,
    shortCode: p.shortCode,
    url: p.url,
    caption,
    captionHead: head,
    hashtags: p.hashtags || [],
    mentions,
    hashtagTokens, captionHeadTokens, captionRestTokens, mentionTokens,
    allTokens: new Set([...hashtagTokens, ...captionHeadTokens, ...captionRestTokens, ...mentionTokens]),
    views: null,                                    // Instagram exposes no view count at all
    likes: p.likesCount === -1 ? null : p.likesCount, // -1 means the owner hid likes
    comments: p.commentsCount ?? null,
    publishedAt: p.timestamp,
    isReel: p.productType === 'clips',
  };
}

function tokenSetOf(text) {
  return new Set(tokenize(text));
}

// Document frequency and IDF are computed per platform: a term common across
// 677 reels ("business" appears in ~195) tells you nothing, while the same
// term across 31 videos means something different.
function buildIdf(items) {
  const df = new Map();
  for (const item of items) {
    for (const t of item.allTokens) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = items.length || 1;
  const norm = Math.log(1 + N);
  const idf = new Map();
  for (const [t, count] of df) {
    idf.set(t, Math.log(1 + N / (1 + count)) / norm);
  }
  return { df, idf };
}

// The browser-facing shape of a corpus item, shared by /api/creator-matches and
// /api/creator-library so the two can't drift — anything picked from either one
// lands in the same `creatorMatches` array and has to survive the same slide.
// Strips the precomputed token Sets, which are large and useless off-server.
export function toWireItem(s, extra = {}) {
  const base = {
    platform: s.platform,
    id: s.id,
    url: s.url,
    publishedAt: s.publishedAt,
    likes: s.likes,
    comments: s.comments,
  };
  const shaped = s.platform === 'youtube'
    ? { ...base, title: s.title, views: s.views, durationLabel: s.durationLabel }
    // Instagram has no title and no view count at all — the caption's first
    // line stands in for one, and likes/comments are the only numbers there are.
    : { ...base, title: (s.captionHead || '').split('\n')[0].slice(0, 120), hashtags: (s.hashtags || []).slice(0, 3), isReel: s.isReel };
  return { ...shaped, ...extra };
}

export async function loadCreatorCorpus() {
  if (cache) return cache;

  const [ytRaw, igRaw] = await Promise.all([readJsonArray(YT_FILE), readJsonArray(IG_FILE)]);
  if (!ytRaw && !igRaw) return { items: [], idf: {}, df: {}, reason: 'no-creator-data' };

  const youtube = (ytRaw || []).map(normaliseYouTube).filter(v => v.id && v.url);

  const instagram = (igRaw || [])
    // 8 of 677 records are other accounts' posts (tags/collabs). Presenting
    // someone else's magazine cover as "our content" would be a credibility hit.
    .filter(p => (p.ownerUsername || '') === OWNER)
    .filter(p => p.type === 'Video')   // 18 Image + 2 Sidecar aren't reels
    .map(normaliseInstagram)
    .filter(p => p.id && p.url);

  const yt = buildIdf(youtube);
  const ig = buildIdf(instagram);

  cache = {
    items: [...youtube, ...instagram],
    idf: { youtube: yt.idf, instagram: ig.idf },
    df: { youtube: yt.df, instagram: ig.df },
    counts: { youtube: youtube.length, instagram: instagram.length },
  };
  return cache;
}

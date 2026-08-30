// Indian brands worth pitching this week, read off three trade-press RSS feeds.
//
// Extraction is deterministic — regex over the headline, no model call. Indian
// trade headlines are formulaic enough for that to work ("X raises Rs Y Cr",
// "X appoints Y as CMO"), and a parse that cannot find a brand drops the item
// rather than guessing. That keeps the feed free to run and free of the failure
// mode where a confident sentence names the wrong company.

import * as cheerio from 'cheerio';
import {
  FEEDS, TRIGGERS, NOT_A_BRAND, NOISE, HEADLINE_PREFIX, MAX_BRAND_WORDS,
  IS_AN_AGENCY, FUND_NEWS, ADTECH_NEWS, MARKETING_ROLE, DESCRIPTOR_PREFIX, brandKey,
} from './prospectsVocab.js';

// Long enough that a page load never waits on a slow outlet, short enough that
// the feed is not stale. Next caches the fetch across requests and across users.
const REVALIDATE_SECONDS = 1800;

// Outlets serve RSS readers happily and datacenter agents suspiciously. This is
// the difference between a feed that works from Vercel and one that 403s.
const UA = 'Mozilla/5.0 (compatible; OpenGreyReports/1.0; +https://opengrey.media)';

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`${feed.name} returned ${res.status}`);
  return res.text();
}

// cheerio in xmlMode rather than a new XML dependency: it is already here for
// lib/brandScrape.js, and an RSS item is a shallower document than the HTML it
// parses every day.
function parseItems(xml, feed) {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('item').toArray().map(el => {
    const $el = $(el);
    return {
      title: decodeEntities($el.find('title').first().text().trim()),
      link: $el.find('link').first().text().trim(),
      publishedAt: $el.find('pubDate').first().text().trim() || null,
      source: feed.name,
      sourceId: feed.id,
    };
  });
}

// Titles arrive with &amp; and friends, and occasionally wrapped in CDATA that
// cheerio has already unwrapped for us. Only the handful that actually show up
// in these three feeds.
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Where the brand ends and the news begins.
//
// Returns the earliest verb match across all triggers, not the first trigger
// with any match — otherwise "Zomato raises Rs 100 Cr and launches a campaign"
// would classify on `launches` purely because campaign verbs are checked last.
function findVerb(title) {
  let best = null;
  for (const trigger of TRIGGERS) {
    for (const verb of trigger.verbs) {
      // \b on both sides so "signs" does not match inside "designs", and the
      // verb has to sit after at least one word — a title opening with the verb
      // has no brand in front of it to take.
      const re = new RegExp(`\\S\\s+\\b${verb.replace(/ /g, '\\s+')}\\b`, 'i');
      const match = re.exec(title);
      if (!match) continue;
      // +1: the pattern starts one character early to prove a word precedes it.
      const at = match.index + 1;
      if (!best || at < best.at) best = { at, trigger, verb };
    }
  }
  return best;
}

// "Chef Sanjyot Keer's Cüraa" and "Cüraa" are one brand, and the feeds use both
// on the same day. Strip the owner so they group.
//
// Only when the owner is two words or more: that separates "Raise Financial's
// Pluto Insurance" from "Levi's India", where the possessive is the brand.
function stripOwner(name) {
  const match = /^(.+?)[’']s\s+(.+)$/.exec(name);
  if (!match) return name;
  const [, owner, rest] = match;
  return owner.trim().split(/\s+/).length >= 2 ? rest : name;
}

function cleanBrand(raw) {
  const brand = stripOwner(raw)
    // "Logistics startup OORJAA" -> "OORJAA". Runs before the word count and
    // the lowercase check so they judge the name, not Entrackr's description.
    .replace(DESCRIPTOR_PREFIX, '')
    .replace(/[\s,;:–—-]+$/, '')
    // Trailing conjunctions left behind by "X and Y launch…" style headlines.
    .replace(/\s+(and|&|with|for|to|of|in|on|at)$/i, '')
    .trim();

  if (!brand) return null;
  if (brand.split(/\s+/).length > MAX_BRAND_WORDS) return null;
  // A leading lowercase word means the verb matched mid-sentence, not after
  // the subject — "the company launches…" is not a brand called "the company".
  if (/^[a-z]/.test(brand)) return null;
  if (NOT_A_BRAND.test(brand)) return null;
  if (IS_AN_AGENCY.test(brand)) return null;
  return brand;
}

// The line printed under the brand name on the card. The headline minus the
// brand, which is exactly the "what happened" half of it.
function reasonFrom(title, brandLength) {
  const rest = title.slice(brandLength).replace(/^[\s,;:–—-]+/, '').trim();
  if (!rest) return null;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// The verb picks the trigger, except where a trigger says otherwise. "Appoints
// X as brand ambassador" hits the people verbs first but is an ambassador
// signing — a stronger signal, and the one the card should show.
function classify(matched, reason) {
  const override = TRIGGERS.find(t => t.object?.test(reason));
  return (override || matched).id;
}

function toProspect(item) {
  const title = item.title.replace(HEADLINE_PREFIX, '').trim();
  if (!title || NOISE.test(title)) return null;

  const verb = findVerb(title);
  if (!verb) return null;

  const brand = cleanBrand(title.slice(0, verb.at));
  if (!brand) return null;

  const reason = reasonFrom(title, verb.at);
  if (!reason) return null;

  // A fund's own corpus and an ad platform's new ads suite both parse cleanly
  // and are both useless as leads. The name cannot tell; the rest of the
  // headline can.
  if (FUND_NEWS.test(reason) || ADTECH_NEWS.test(reason)) return null;

  // Someone starting an agency parses as cleanly as a brand launching a product
  // — "Karan Kumar launches independent advisory practice Inflection". That is a
  // new competitor, not a new prospect.
  if (/\b(advisory practice|independent practice|consultancy|own agency|new agency)\b/i.test(reason)) return null;

  const trigger = classify(verb.trigger, reason);
  // An appointment that isn't a marketing one is not a reason to pitch. Dropped
  // rather than downgraded — a new CTO says nothing about a marketing budget.
  if (trigger === 'people' && !MARKETING_ROLE.test(reason)) return null;

  return {
    brand,
    key: brandKey(brand),
    trigger,
    reason,
    url: item.link,
    source: item.source,
    publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
  };
}

// One row per brand, carrying every signal seen for it — not one row per
// headline. A brand that just raised AND is already running a campaign is a far
// better lead than two brands with one signal each, and the feed can only say
// so if the signals are grouped rather than flattened into a single string.
function groupByBrand(prospects) {
  const byKey = new Map();
  for (const p of prospects) {
    if (!byKey.has(p.key)) byKey.set(p.key, { brand: p.brand, key: p.key, raw: [] });
    byKey.get(p.key).raw.push(p);
  }

  return [...byKey.values()].map(({ brand, key, raw }) => {
    // One line per trigger, not per headline. Two outlets reporting the same
    // round are corroboration, not a second reason to pitch — collapsing them
    // here is also what stops the ranking below counting it as two signals.
    const byTrigger = new Map();
    for (const p of [...raw].sort(byNewest)) {
      const seen = byTrigger.get(p.trigger);
      if (seen) {
        if (!seen.sources.includes(p.source)) seen.sources.push(p.source);
        continue;
      }
      // The newest wins the wording, since it is sorted newest-first above.
      byTrigger.set(p.trigger, { ...p, sources: [p.source] });
    }

    const signals = [...byTrigger.values()].sort(byNewest);
    return { brand, key, signals, latest: signals[0].publishedAt };
  });
}

function byNewest(a, b) {
  return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
}

// Brands carry `latest` where a signal carries `publishedAt`, so they need
// their own comparator — byNewest reads a field brands do not have.
function byLatest(a, b) {
  return new Date(b.latest || 0) - new Date(a.latest || 0);
}

/** Everything the three feeds are saying right now, best lead first.
 *
 * Never throws on a dead feed. One outlet changing its URL or blocking the
 * server must not take the home page down with it — the feeds that answered
 * still render, and the ones that did not are named in `failed` so a silently
 * dead source is visible rather than looking like a quiet week. */
export async function fetchProspects({ limit = 24 } = {}) {
  const results = await Promise.allSettled(
    FEEDS.map(async feed => parseItems(await fetchFeed(feed), feed))
  );

  const items = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value);
    else failed.push({ source: FEEDS[i].name, error: r.reason?.message || 'unreachable' });
  });

  const prospects = items.map(toProspect).filter(Boolean);
  const brands = groupByBrand(prospects);

  // Brands showing more than one KIND of signal first, then by recency. A brand
  // that just raised and is already running a campaign is a far better lead than
  // two brands with one signal each — that is the whole point of grouping.
  brands.sort((a, b) => b.signals.length - a.signals.length || byLatest(a, b));

  return {
    brands: brands.slice(0, limit),
    // Ungrouped and untruncated, for the archive. The home page wants the top
    // few brands; the archive wants every headline that parsed, including the
    // ones that fell past `limit` — a brand nobody is watching today may be
    // watched next week, and by then the feed will not carry the story.
    parsed: prospects,
    counts: { items: items.length, parsed: prospects.length, brands: brands.length },
    failed,
  };
}

// What a prospect's own website says about them.
//
// Ported from the Python service this app replaces. One thing is genuinely
// lost in the move and is worth stating rather than discovering: scrapling's
// Fetcher used curl_cffi, which presents a real browser's TLS fingerprint.
// Node's fetch presents Node's. Sites behind Cloudflare or Akamai that the
// Python version walked through may answer this one with a challenge page, and
// serverless egress IPs make that likelier, not less. There is no equivalent
// in Node; a residential proxy fixes the address but not the handshake.
//
// Everything here is best-effort by design. A brand with no About page, no
// JSON-LD and no theme colour still returns a usable object — the deck has a
// fallback for each of those, and a half-scraped prospect is worth more than an
// exception.
import * as cheerio from "cheerio";
import { extractVisualIdentity } from "./brandColour.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BASE_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// Three, not the Python module's six. That version could afford a two-minute
// worst case; this one runs inside a serverless invocation with a wall clock,
// and a site that has refused three times with backoff is not about to relent.
const MAX_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 15000;
const MAX_SUBPAGE_FETCHES = 3;

const SOCIAL_RE =
  /https?:\/\/(?:www\.)?(instagram|facebook|pinterest|youtube|twitter|x|linkedin|tiktok|threads)\.com\/[^\s"'<>]+/gi;
const WHATSAPP_RE = /(?:https?:\/\/)?(?:api\.)?(?:wa\.me|whatsapp\.com\/send)[^\s"'<>]*/i;
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

// Only About is crawled. The Python version also fetched Contact and Franchise
// pages, but the text they produced fed fields no slide ever printed, so every
// prospect paid two extra round trips for nothing.
const SUBPAGE_KEYWORDS = ["about", "our story"];
const FALLBACK_PATHS = ["/pages/about-us", "/about", "/about-us"];

const ADS_CAVEAT =
  "Presence of a tracking pixel suggests capability/history of paid social ads but does not " +
  "confirm an active campaign right now; absence doesn't rule out server-side tracking. " +
  "Meta's Ad Library isn't scrapable without a verified API app, so this is a heuristic only.";

export class InvalidURL extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidURL";
  }
}

export class GaveUp extends Error {
  constructor(message) {
    super(message);
    this.name = "GaveUp";
  }
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------
export function normalizeUrl(raw) {
  let value = String(raw || "").trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new InvalidURL(`'${raw}' doesn't look like a valid URL.`);
  }
  if (!HOSTNAME_RE.test(parsed.hostname.toLowerCase())) {
    throw new InvalidURL(`'${raw}' doesn't look like a valid URL.`);
  }
  return parsed.toString();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET with status-aware retry. 404 comes back as-is so the caller decides. */
async function robustFetch(url) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        response = await fetch(url, {
          headers: BASE_HEADERS,
          redirect: "follow",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      throw new GaveUp(`Couldn't reach ${url}: ${err.message || err}`);
    }

    if (response.ok || response.status === 404) return response;

    if (attempt >= MAX_ATTEMPTS) {
      throw new GaveUp(`${url}: gave up after ${MAX_ATTEMPTS} attempts (HTTP ${response.status}).`);
    }
    // Jittered so two decks built at once don't retry in lockstep.
    await sleep(Math.min(8000, 1500 * 2 ** (attempt - 1)) * (0.8 + Math.random() * 0.4));
  }
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------
function extractJsonLd($) {
  const blocks = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed;
    try {
      parsed = JSON.parse($(el).text());
    } catch {
      return;
    }
    if (Array.isArray(parsed)) blocks.push(...parsed);
    else if (parsed && Array.isArray(parsed["@graph"])) blocks.push(...parsed["@graph"]);
    else if (parsed && typeof parsed === "object") blocks.push(parsed);
  });
  return blocks;
}

function pickOrgBlock(blocks) {
  for (const block of blocks) {
    const raw = block?.["@type"] ?? "";
    const types = Array.isArray(raw) ? raw : [raw];
    if (types.some((t) => t === "Organization" || t === "LocalBusiness" || String(t).includes("Store") || String(t).includes("Business"))) {
      return block;
    }
  }
  return {};
}

function extractMeta($) {
  const attr = (selector, name) => {
    const value = $(selector).first().attr(name);
    return value ? value.trim() : null;
  };
  const title = $("title").first().text();
  return {
    title: title ? title.trim() : null,
    description: attr('meta[name="description"]', "content"),
    ogTitle: attr('meta[property="og:title"]', "content"),
    ogDescription: attr('meta[property="og:description"]', "content"),
    ogImage: attr('meta[property="og:image"]', "content"),
  };
}

/** The brand's declared colour and a clean square mark. The favicon usually
 * beats og:image for a logo — og:image is often a hero photo. */
function extractThemeMeta($) {
  const attr = (selector, name) => {
    const value = $(selector).first().attr(name);
    return value ? value.trim() : null;
  };
  return {
    themeColour: attr('meta[name="theme-color"]', "content"),
    appleTouchIcon: attr('link[rel="apple-touch-icon"]', "href"),
    icon: attr('link[rel="icon"]', "href") || attr('link[rel="shortcut icon"]', "href"),
  };
}

function detectPlatform(html) {
  if (html.includes("cdn.shopify.com") || /Shopify\.shop\s*=\s*"/.test(html)) return "shopify";
  if (html.includes("wp-content") || html.includes("wp-includes")) return "wordpress";
  return "unknown";
}

function extractSocialLinks(jsonLdBlocks, html) {
  const links = {};
  const add = (platform, url) => {
    const key = platform === "x" ? "twitter" : platform;
    if (!links[key]) links[key] = url;
  };

  // Declared relationships first — a sameAs is the brand saying "this is us",
  // where a regex over the page can pick up an embed or a share button.
  for (const block of jsonLdBlocks) {
    const sameAs = Array.isArray(block?.sameAs) ? block.sameAs : block?.sameAs ? [block.sameAs] : [];
    for (const url of sameAs) {
      const social = new RegExp(SOCIAL_RE.source, "i").exec(url);
      if (social) add(social[1].toLowerCase(), social[0]);
      else if (WHATSAPP_RE.test(url)) add("whatsapp", url);
    }
  }

  for (const match of html.matchAll(SOCIAL_RE)) add(match[1].toLowerCase(), match[0]);

  const wa = WHATSAPP_RE.exec(html);
  if (wa) add("whatsapp", wa[0]);

  return links;
}

function detectAdPixels(html) {
  const metaSignatures = ["fbq(", "connect.facebook.net", "fbevents.js"];
  const googleSignatures = ["gtag(", "googletagmanager.com/gtag/js", "google_conversion_id"];
  const found = [...metaSignatures, ...googleSignatures].filter((s) => html.includes(s));
  return {
    meta_pixel: metaSignatures.some((s) => html.includes(s)),
    google_ads: googleSignatures.some((s) => html.includes(s)),
    signatures_found: found,
    caveat: ADS_CAVEAT,
  };
}

function discoverAboutPage($, baseUrl) {
  let found = null;
  $("a").each((_, el) => {
    if (found) return;
    const href = $(el).attr("href");
    if (!href) return;
    const haystack = `${href.toLowerCase()} ${$(el).text().trim().toLowerCase()}`;
    if (SUBPAGE_KEYWORDS.some((kw) => haystack.includes(kw))) {
      try {
        found = new URL(href, baseUrl).toString();
      } catch {
        /* a malformed href is not a reason to stop looking */
      }
    }
  });
  return found;
}

async function tryFallbackPaths(baseUrl, budget) {
  for (const path of FALLBACK_PATHS) {
    if (budget.remaining <= 0) return null;
    budget.remaining -= 1;
    let candidate;
    try {
      candidate = new URL(path, baseUrl).toString();
    } catch {
      continue;
    }
    try {
      const response = await robustFetch(candidate);
      if (response.ok) return candidate;
    } catch {
      /* GaveUp on a guess is not a failure of the scrape */
    }
  }
  return null;
}

/** Visible text, roughly as a reader would see it. Feeds the creator-content
 * matcher, which scores on word overlap — so script and style content would be
 * pure noise. */
function visibleText($) {
  $("script, style, noscript, svg").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
/** Uncached, deliberately: this costs one homepage fetch plus at most one About
 * page, is free, and returns ~5KB. A stale entry would quietly hand a
 * salesperson last month's social links. The calls that cost money are the ones
 * that get cached — see lib/auditCache.js. */
export async function scrapeBrand(rawUrl) {
  const normalized = normalizeUrl(rawUrl);

  const response = await robustFetch(normalized);
  if (response.status === 404) {
    throw new GaveUp(`${normalized} returns 404 — check the URL.`);
  }

  const html = await response.text();
  const finalUrl = response.url || normalized;
  const $ = cheerio.load(html);

  const jsonLdBlocks = extractJsonLd($);
  const org = pickOrgBlock(jsonLdBlocks);
  const meta = extractMeta($);
  const themeMeta = extractThemeMeta($);

  const name = org.name || meta.ogTitle || meta.title || "";
  const description = meta.description || meta.ogDescription || "";

  const orgLogo = typeof org.logo === "string" ? org.logo : null;
  const iconHref = themeMeta.appleTouchIcon || themeMeta.icon;
  let logoUrl = orgLogo || meta.ogImage || null;
  if (!orgLogo && iconHref) {
    try {
      logoUrl = new URL(iconHref, finalUrl).toString();
    } catch {
      /* keep whatever we had */
    }
  }

  // About text is never printed on a slide. It exists because it is the corpus
  // the creator-content matcher scores a brand against, which is what fills the
  // track-record slide.
  const homepageText = visibleText(cheerio.load(html));
  const budget = { remaining: MAX_SUBPAGE_FETCHES };
  let aboutUrl = discoverAboutPage($, finalUrl);
  if (!aboutUrl) aboutUrl = await tryFallbackPaths(finalUrl, budget);

  let aboutText = null;
  if (aboutUrl) {
    try {
      const aboutResponse = await robustFetch(aboutUrl);
      if (aboutResponse.ok) aboutText = visibleText(cheerio.load(await aboutResponse.text()));
    } catch {
      /* the homepage copy below is a fine substitute */
    }
  }

  const visualIdentity = await extractVisualIdentity(html, themeMeta.themeColour, logoUrl);

  return {
    url: normalized,
    final_url: finalUrl,
    name,
    description,
    logo_url: logoUrl,
    theme_color: themeMeta.themeColour,
    platform: detectPlatform(html),
    social_links: extractSocialLinks(jsonLdBlocks, html),
    ads_signal: detectAdPixels(html),
    about: { description, about_text: aboutText || homepageText },
    visual_identity: visualIdentity,
    fetched_at: new Date().toISOString(),
  };
}

// Brand payloads shaped exactly like the `GET /brand` response, chosen to
// cover the cases that actually break a layout: a clean short brand name, a
// <title>-as-name with two founders and 90 words of about copy, and extreme
// logo aspect ratios. Real PNG bytes are generated at chosen pixel sizes so
// image placement can be checked against a known source ratio.
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A solid-colour PNG of exactly w x h pixels, as a data URI. */
export function png(w, h, rgb = [200, 90, 40]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      raw[row + 1 + x * 3] = rgb[0];
      raw[row + 2 + x * 3] = rgb[1];
      raw[row + 3 + x * 3] = rgb[2];
    }
  }
  const buf = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/**
 * One image payload in the backend's shape. `withDims: false` omits the w/h
 * the backend normally attaches, which is what forces the deck to recover the
 * source ratio from the file header instead.
 */
export function image(w, h, { withDims = true } = {}) {
  const payload = { data_uri: png(w, h), source: "test", url: `https://example.test/${w}x${h}.png` };
  return withDims ? { ...payload, w, h } : payload;
}

const LONG_ABOUT =
  "We started in a two-room workshop in Pune with one cutting table and a very " +
  "stubborn idea: that the clothes people actually live in should be made as " +
  "carefully as the clothes they photograph. Eleven years later we ship to " +
  "every pin code in the country, we still cut our first pattern by hand, and " +
  "every single fabric we use is milled within four hundred kilometres of that " +
  "original workshop. Nothing about that is convenient. All of it is deliberate.";

export const BRANDS = {
  // The everyday case: short name, full imagery, square logo mark.
  typical: {
    name: "Mokobara",
    url: "https://mokobara.com",
    platform: "shopify",
    description: "Luggage designed for the way Indians actually travel.",
    about: { description: "Luggage designed for the way Indians actually travel.", founder_candidates: ["Navin Parwal"] },
    social_links: { instagram: "x", youtube: "y", facebook: "z" },
    contact: { emails: [{ address: "care@mokobara.com", own_domain_match: true }], phones: [] },
    ads_signal: { meta_pixel: true, google_ads: false },
    visual_identity: { palette: { primary: "#1B4D3E" } },
    imagery: {
      hero: image(1600, 900),
      logo: image(512, 512),
      gallery: [image(1200, 800), image(900, 1200), image(1600, 400)],
    },
  },

  // The hostile case: a full <title> as the name, no imagery at all (both §5
  // fallbacks fire), long about copy, two founders, an achromatic palette.
  hostile: {
    name: "Online Fashion Shopping for Men, Women, Accessories - Bewakoof.com",
    url: "https://www.bewakoof.com",
    platform: "custom",
    description: LONG_ABOUT,
    about: { description: LONG_ABOUT, founder_candidates: ["Prabhkiran Singh", "Siddharth Munot"] },
    social_links: { instagram: "x", youtube: "y", facebook: "z", twitter: "t", pinterest: "p" },
    contact: { emails: [{ address: "customercare@bewakoof.com", own_domain_match: true }], phones: [] },
    ads_signal: {},
    visual_identity: { palette: { primary: "#000000" } },
    imagery: { hero: null, logo: null, gallery: [] },
  },

  // Extreme aspect ratios: a portrait hero into a landscape bleed, and a
  // 8:1 logo whose payload carries no dimensions.
  wideLogo: {
    name: "NatureWings Holidays",
    url: "https://naturewings.com",
    platform: "wordpress",
    description: "Himalayan travel, run by people who live there.",
    about: { description: "Himalayan travel, run by people who live there.", founder_candidates: [] },
    social_links: { instagram: "x" },
    contact: { emails: [{ address: "hello@naturewings.com", own_domain_match: true }], phones: ["+91 90000 00000"] },
    ads_signal: { meta_pixel: true, google_ads: true },
    visual_identity: { palette: { primary: "#C2410C" } },
    imagery: {
      hero: image(900, 1600),
      logo: image(1600, 200, { withDims: false }),
      // A square packshot and two portrait photographs, so slide 2's per-image
      // fit decision is exercised: the square fills its frame, the portraits
      // are shown whole rather than cropped through the subject.
      gallery: [image(400, 400), image(438, 570), image(389, 537)],
    },
  },
};

export const IG_AUDIT = {
  profile: { username: "mokobara", followers: 428000 },
  performance: { engagement_rate_percent: 0.84, avg_likes: 3210, avg_comments: 96, posts_per_week: 5.5 },
  content_mix: { reel: 62, carousel: 28, image: 10 },
};

// Three reels and two videos, because that is what the deck now asks for
// (`contentLimitsFor` in BrandPitchDeck.jsx) — and every item carries the
// public URL the proof slide prints and hyperlinks. The third reel is
// deliberately the longest caption in the set: the reels band sizes itself off
// the longest one, so it is the one that decides whether the band still clears
// the folio rule.
const REELS = [
  {
    caption:
      "Every founder I meet says the same thing about their first year — that the hardest part was not the money, it was explaining to their parents why they left a perfectly good job to do this.",
    likes: 18400,
    comments: 312,
    matched: true,
    url: "https://www.instagram.com/reel/DcRDJlBTIZK/",
  },
  // Deliberately unquotable: exercises the hygiene fallback.
  {
    caption: "#hustle #grind #motivation #entrepreneur #india",
    likes: 9100,
    comments: 88,
    matched: true,
    url: "https://www.instagram.com/reel/Db-9YNsT4O4/",
  },
  {
    caption:
      "We spent eleven months building the wrong product for the right customer, and the only reason the company is still here is that one of them told us so, loudly, at eleven at night, and we actually listened to the whole thing twice over before we started arguing about it.",
    likes: 34030,
    comments: 641,
    matched: false,
    url: "https://www.instagram.com/reel/DV6QuoCk9Ci/",
  },
];

const VIDEOS = [
  {
    title: "How Horizon Reclaim Built A 100 Crore Business From Absolute Scratch In Just Six Years",
    view_count_text: "412K views",
    thumbnail: image(1280, 720),
    matched: true,
    url: "https://www.youtube.com/watch?v=LiY0vGWOrS0",
  },
  {
    title: "The Truth About Bootstrapping In India",
    view_count_text: "88K views",
    thumbnail: image(640, 480),
    matched: true,
    url: "https://www.youtube.com/watch?v=XQCU3cmN-kk",
  },
];

/**
 * What `GET /creator-content-matches` returns for one offer type — the same
 * split `contentLimitsFor` asks for, so each case exercises the layout that
 * offer actually ships: tiles only (podcast), a three-up reels band only
 * (influencer), or the band under the tiles (both). A flat fixture that always
 * carried both platforms would have tested a slide no deck ever builds.
 */
export function matchesFor(offerType) {
  const igLimit = offerType === "podcast" ? 0 : 3;
  const ytLimit = offerType === "marketing" ? 0 : 2;
  return {
    instagram: { matched_count: Math.min(2, igLimit), posts: REELS.slice(0, igLimit) },
    youtube: { matched_count: ytLimit, videos: VIDEOS.slice(0, ytLimit) },
  };
}

/**
 * What the deck carries after someone edited it in the pitch page's content
 * panel: an item the matcher chose sitting next to one a person added by hand.
 *
 * Two things only this shape reaches. `addProofSlide` filters the video row to
 * matched items when it has any, so a hand-added episode next to an auto-matched
 * one is exactly the case that could vanish from the file with nothing raised.
 * And a marketing deck with an episode on it is a layout no offer type builds on
 * its own — the panel lets a person override `contentLimitsFor`, so the reels
 * band and the video tiles can now appear together under an influencer pitch.
 */
export function curatedMatches(offerType) {
  const igLimit = offerType === "podcast" ? 0 : 3;
  return {
    instagram: {
      matched_count: Math.min(2, igLimit),
      posts: REELS.slice(0, igLimit).map((r, i) => (i === 1 ? { ...r, matched: false, manual: true } : r)),
    },
    youtube: {
      matched_count: 2,
      videos: [VIDEOS[0], { ...VIDEOS[1], matched: false, manual: true }],
    },
  };
}

/** Every brand x offer combination the audit builds. */
export const CASES = [
  ["typical-podcast", { brand: BRANDS.typical, offerType: "podcast", igAudit: IG_AUDIT, contentMatches: matchesFor("podcast") }],
  ["typical-marketing", { brand: BRANDS.typical, offerType: "marketing", igAudit: IG_AUDIT, contentMatches: matchesFor("marketing") }],
  ["typical-both", { brand: BRANDS.typical, offerType: "both", igAudit: IG_AUDIT, contentMatches: matchesFor("both") }],
  // igAudit: null drops slide 3 and renumbers the deck (DECK_PLAN §5).
  ["hostile-podcast-noig", { brand: BRANDS.hostile, offerType: "podcast", igAudit: null, contentMatches: matchesFor("podcast") }],
  ["hostile-both", { brand: BRANDS.hostile, offerType: "both", igAudit: IG_AUDIT, contentMatches: matchesFor("both") }],
  ["widelogo-marketing", { brand: BRANDS.wideLogo, offerType: "marketing", igAudit: IG_AUDIT, contentMatches: matchesFor("marketing") }],
  ["widelogo-podcast-noig", { brand: BRANDS.wideLogo, offerType: "podcast", igAudit: null, contentMatches: null }],
  // Neither offer selected: slides 7 and 8 both drop and the deck is eight
  // slides of shared argument. The one case where the offer-aware slides render
  // from a variant nobody picked — see OFFER_VARIANTS.none.
  ["typical-none", { brand: BRANDS.typical, offerType: "none", igAudit: IG_AUDIT, contentMatches: matchesFor("none") }],
  // Hand-edited in the content panel — see `curatedMatches`.
  ["curated-both", { brand: BRANDS.typical, offerType: "both", igAudit: IG_AUDIT, contentMatches: curatedMatches("both") }],
  ["curated-marketing-plus-episode", { brand: BRANDS.hostile, offerType: "marketing", igAudit: IG_AUDIT, contentMatches: curatedMatches("marketing") }],
  // The closing slide with a contact on it. Every case above leaves it off, so
  // the block stays one line and the taller two-line layout never gets drawn --
  // which is exactly the geometry most likely to run into the footer rule. The
  // longest realistic values go here for that reason, not for realism.
  ["contact-both", {
    brand: BRANDS.typical,
    offerType: "both",
    igAudit: IG_AUDIT,
    contentMatches: matchesFor("both"),
    contact: {
      headline: "A 20-minute call to lock your episode date.",
      bookingLink: "cal.com/opengreymedia/episode",
      email: "partnerships@opengrey.media",
      phone: "+91 98765 43210",
    },
  }],
];

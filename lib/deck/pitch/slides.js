// The eleven slide builders. Layout geometry is read off the approved reference
// deck (demo_ppt/Beanly_x_OpenGreyMedia.pptx); colour arrives through the
// theme, never as a literal.
//
// Every slide takes (pptx, { theme, ... }) and adds exactly one slide. The
// spine is fixed — a missing Instagram audit swaps slide 2 for a brand
// portrait rather than dropping it, because the deck's length is part of what
// was approved.

import { CASE_STUDY_THUMBS } from "../assets/caseStudy.js";
import { CREATOR_PORTRAIT } from "../assets/creator.js";
import { CASE_STUDY_BENEFITS, CASE_STUDY_CLIPS } from "../caseStudy.js";
import { CREATOR_ANALYTICS, compact, hoursMinutes } from "../creatorStats.js";
import { OFFER_VARIANTS, benchmarkFor, offerIncludes } from "../openGreyOffer.js";
import { benchmarkChart, contentMixChart } from "./charts.js";
import {
  calloutStrip,
  card,
  chip,
  fitText,
  footer,
  imageFit,
  linkCard,
  rect,
  rule,
  slideHeader,
  statCard,
  text,
} from "./primitives.js";
import { CALIBRI, CAMBRIA, CONTENT_W, FOLIO_Y, TYPE, hx } from "./theme.js";

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function newSlide(pptx, t, { dark = false } = {}) {
  const slide = pptx.addSlide();
  slide.background = { color: hx(dark ? t.deep : t.paper) };
  return slide;
}

function brandName(brand) {
  return String(brand?.name || "Your Brand").trim();
}

/**
 * A brand name fit for the cover lockup.
 *
 * `GET /brand` frequently returns the page <title> as the name ("Online
 * Fashion Shopping for Men, Women, Accessories - Bewakoof.com"), which set at
 * 40pt covers the whole cover. Take the part before the first separator, drop
 * a trailing TLD, and cap the length.
 */
function coverName(brand) {
  let n = brandName(brand).split(/\s+[|–—-]\s+/)[0].trim();
  n = n.replace(/\.(com|in|co|io|net|org)$/i, "");
  if (n.length > 26) n = n.slice(0, 25).trimEnd() + "…";
  return n.toUpperCase();
}

/**
 * The brand name as a label, not a headline — the part before the first
 * separator, capped short. Used wherever the name is interpolated into running
 * copy or a kicker rather than set on its own.
 */
function shortBrand(brand) {
  let n = brandName(brand).split(/\s+[|–—-]\s+/)[0].trim();
  n = n.replace(/\.(com|in|co|io|net|org)$/i, "");
  // 30, not 22: the kicker box is the full 9in measure at 11pt, so a real
  // company name ("Summercool Home Appliances") fits comfortably and should
  // not be ellipsised. `slideHeader` still ellipsises whatever genuinely
  // overflows, so this cap only has to stop the pathological page-title case.
  return n.length > 30 ? n.slice(0, 29).trimEnd() + "…" : n;
}

function pct(n, digits = 2) {
  return Number.isFinite(Number(n)) ? `${Number(n).toFixed(digits)}%` : "—";
}

/** Video-ish vs photo-ish share of the prospect's recent posts. */
function splitContentMix(mix) {
  if (!mix || typeof mix !== "object") return null;
  let video = 0;
  let photo = 0;
  for (const [k, v] of Object.entries(mix)) {
    const n = Number(v) || 0;
    if (/reel|video|clip/i.test(k)) video += n;
    else if (/image|photo|carousel|album|sidecar/i.test(k)) photo += n;
  }
  return video + photo > 0 ? { video, photo } : null;
}

// ---------------------------------------------------------------------------
// 1 — Cover
// ---------------------------------------------------------------------------
export function addCoverSlide(pptx, { theme: t, brand, year }) {
  const slide = newSlide(pptx, t, { dark: true });

  text(slide, `PARTNERSHIP PITCH   ·   ${year}`, {
    x: 0.7,
    y: 0.7,
    w: CONTENT_W - 0.4,
    h: 0.35,
    fontFace: CALIBRI,
    fontSize: 12,
    charSpacing: 2.5,
    color: hx(t.gold),
  });

  fitText(slide, coverName(brand), {
    x: 1.5,
    y: 1.56,
    w: 7,
    h: 0.7,
    fontSize: TYPE.coverTitle.size,
    minFontSize: 22,
    fontFace: CAMBRIA,
    bold: true,
    maxLines: 1,
    lineSpacingMultiple: 1.0,
    align: "center",
    color: "FFFFFF",
  });

  text(slide, "X OPEN GREY MEDIA", {
    x: 1.5,
    y: 2.3,
    w: 7,
    h: 0.35,
    fontFace: CAMBRIA,
    fontSize: 16,
    bold: true,
    align: "center",
    charSpacing: 1.5,
    color: hx(t.gold),
  });

  const pitch =
    `Bring ${brandName(brand)} to a new audience of young, on-the-go Indians — ` +
    `through India's fastest-growing business & lifestyle podcast network.`;
  fitText(slide, pitch, {
    x: 0.7,
    y: 3.3,
    w: 7.8,
    h: 1.0,
    fontSize: TYPE.coverSub.size,
    minFontSize: 11,
    fontFace: CALIBRI,
    lineSpacingMultiple: 1.35,
    maxLines: 4,
    color: hx(t.onDeep),
  });

  rule(slide, { x: 0.7, y: 4.55, w: 1.5, weightPt: 3, color: t.gold });
  footer(slide, t, { onDark: true });
  return slide;
}

// ---------------------------------------------------------------------------
// 2 — The prospect's own Instagram, or a brand portrait when there is none
// ---------------------------------------------------------------------------
export function addInstagramSlide(pptx, { theme: t, brand, igAudit }) {
  const slide = newSlide(pptx, t);
  const profile = igAudit?.profile || {};
  const perf = igAudit?.performance || {};
  const followers = Number(profile.followers) || 0;
  const er = Number(perf.engagement_rate_percent);
  const bench = benchmarkFor(followers);

  slideHeader(slide, t, {
    kicker: `${shortBrand(brand)} on social`,
    title: "Instagram Analytics",
    subhead: profile.username ? `@${profile.username}` : "",
  });

  // Four stats, 2 x 2 on the left.
  const stats = [
    { value: compact(followers), label: "Followers" },
    { value: compact(Number(perf.avg_likes) || 0), label: "Avg. likes / post" },
    { value: compact(Number(perf.avg_comments) || 0), label: "Avg. comments / post" },
    { value: pct(er), label: "Engagement rate" },
  ];
  stats.forEach((s, i) => {
    statCard(slide, t, {
      x: 0.5 + (i % 2) * 2.05,
      y: 1.65 + Math.floor(i / 2) * 1.15,
      w: 1.9,
      h: 1.0,
      value: s.value,
      label: s.label,
      valueSize: 24,
    });
  });

  // Content mix.
  const mix = splitContentMix(igAudit?.content_mix);
  text(slide, "CONTENT MIX", {
    x: 4.85,
    y: 1.65,
    w: 2.0,
    h: 0.25,
    fontFace: CALIBRI,
    fontSize: 10.5,
    bold: true,
    color: hx(t.ink),
  });
  const drewMix = mix && contentMixChart(slide, t, { x: 4.7, y: 1.9, w: 2.1, h: 1.85, ...mix });
  if (!drewMix) {
    fitText(slide, "Content mix unavailable for this account.", {
      x: 4.85,
      y: 2.4,
      w: 1.9,
      h: 0.6,
      fontSize: 9,
      fontFace: CALIBRI,
      color: hx(t.muted),
    });
  }
  const sample = Number(perf.sample_size) || 0;
  fitText(slide, sample ? `Based on the ${sample} most recent posts.` : "", {
    x: 4.7,
    y: 3.8,
    w: 2.3,
    h: 0.3,
    fontSize: 8,
    fontFace: CALIBRI,
    maxLines: 2,
    color: hx(t.muted),
  });

  // Engagement against accounts of the same size.
  fitText(slide, "ENGAGEMENT VS. TYPICAL ACCOUNTS THIS SIZE", {
    x: 7.05,
    y: 1.65,
    w: 2.45,
    h: 0.35,
    fontSize: 10.5,
    minFontSize: 8.5,
    fontFace: CALIBRI,
    bold: true,
    maxLines: 2,
    lineSpacingMultiple: 1.15,
    color: hx(t.ink),
  });
  benchmarkChart(slide, t, {
    x: 6.9,
    y: 2.05,
    w: 2.6,
    h: 1.7,
    rows: [
      { label: profile.username ? `@${profile.username}` : brandName(brand), value: er, highlight: true },
      { label: "Strong for this size", value: bench.strong },
      { label: "Typical for this size", value: bench.median },
    ],
  });

  const verdict = Number.isFinite(er)
    ? er >= bench.median
      ? `At ${compact(followers)} followers and a ${pct(er)} engagement rate, ${brandName(brand)} is already ahead of the ${pct(bench.median)} typical for an account this size. The next challenge isn't engagement, it's reach — an Open Grey Media partnership puts that same high-intent audience in front of millions of new listeners across India.`
      : `At ${compact(followers)} followers, ${brandName(brand)} has an audience worth growing — engagement sits at ${pct(er)} against ${pct(bench.median)} typical for this size. An Open Grey Media partnership brings both: new reach across India, and the kind of story-led content that earns attention rather than buying it.`
    : `${brandName(brand)} has an audience worth growing. An Open Grey Media partnership puts the brand in front of millions of young, on-the-go Indians across podcast, Reels and Shorts.`;

  calloutStrip(slide, t, { x: 0.5, y: 4.15, w: CONTENT_W, h: 1.0, kicker: "What this means", body: verdict });

  footer(slide, t);
  return slide;
}

/** Stand-in for slide 2 when the prospect has no usable Instagram audit. */
export function addBrandPortraitSlide(pptx, { theme: t, brand }) {
  const slide = newSlide(pptx, t);
  slideHeader(slide, t, {
    kicker: "The brand",
    title: brandName(brand).length > 34 ? "Who We're Writing To" : brandName(brand),
    subhead: brand?.url ? String(brand.url).replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "") : "",
  });

  const about = String(brand?.about?.description || brand?.description || "").trim();
  card(slide, t, { x: 0.5, y: 1.75, w: 5.6, h: 2.3 });
  fitText(slide, about || `${brandName(brand)} — a brand we'd like to put in front of our audience.`, {
    x: 0.75,
    y: 1.95,
    w: 5.1,
    h: 1.9,
    fontSize: 11,
    minFontSize: 8.5,
    fontFace: CALIBRI,
    lineSpacingMultiple: 1.35,
    maxLines: 9,
    color: hx(t.ink),
  });

  const facts = [
    ["Platform", brand?.platform || "—"],
    ["Channels", String(Object.keys(brand?.social_links || {}).length || "—")],
    ["Running ads", brand?.ads_signal?.meta_pixel || brand?.ads_signal?.google_ads ? "Yes" : "Not detected"],
  ];
  facts.forEach(([label, value], i) => {
    statCard(slide, t, {
      x: 6.3,
      y: 1.75 + i * 0.8,
      w: 3.2,
      h: 0.7,
      value: String(value),
      label,
      valueSize: 15,
    });
  });

  calloutStrip(slide, t, {
    x: 0.5,
    y: 4.15,
    w: CONTENT_W,
    h: 1.0,
    kicker: "Why we're writing",
    body: `We couldn't pull public Instagram metrics for ${brandName(brand)}, so this deck leads with what Open Grey Media brings rather than with your numbers. Everything that follows is measured on our side.`,
  });

  footer(slide, t);
  return slide;
}

// ---------------------------------------------------------------------------
// 3 — The market
// ---------------------------------------------------------------------------
export function addOpportunitySlide(pptx, { theme: t, offerType }) {
  const slide = newSlide(pptx, t);
  const offer = OFFER_VARIANTS[offerType] || OFFER_VARIANTS.podcast;

  slideHeader(slide, t, {
    kicker: "Market context",
    title: "The Opportunity",
    subhead: offer.opportunity.subtitle,
  });

  offer.opportunity.items.slice(0, 3).forEach((item, i) => {
    const x = 0.5 + i * 3.05;
    card(slide, t, { x, y: 1.9, w: 2.8, h: 2.6 });
    chip(slide, t, { x: x + 0.25, y: 2.15, d: 0.45, label: String(i + 1), fontSize: 14 });

    fitText(slide, item.value, {
      x: x + 0.25,
      y: 2.75,
      w: 2.3,
      h: 0.6,
      fontSize: TYPE.statBig.size,
      minFontSize: 18,
      fontFace: CAMBRIA,
      bold: true,
      maxLines: 1,
      lineSpacingMultiple: 1.0,
      color: hx(t.panel),
    });
    fitText(slide, item.label, {
      x: x + 0.25,
      y: 3.4,
      w: 2.3,
      h: 0.55,
      fontSize: 12.5,
      minFontSize: 9.5,
      fontFace: CALIBRI,
      bold: true,
      maxLines: 2,
      lineSpacingMultiple: 1.2,
      color: hx(t.ink),
    });
    fitText(slide, item.sub, {
      x: x + 0.25,
      y: 4.0,
      w: 2.3,
      h: 0.4,
      fontSize: 9.5,
      minFontSize: 8,
      fontFace: CALIBRI,
      maxLines: 2,
      lineSpacingMultiple: 1.25,
      color: hx(t.muted),
    });
  });

  footer(slide, t);
  return slide;
}

// ---------------------------------------------------------------------------
// 4 — Open Grey Media's reach
// ---------------------------------------------------------------------------
export function addReachSlide(pptx, { theme: t, brand }) {
  const slide = newSlide(pptx, t);
  const reach = OFFER_VARIANTS.podcast.reach;

  slideHeader(slide, t, {
    kicker: "Open Grey Media",
    title: reach.title,
    subhead: reach.subtitle,
  });

  reach.items.slice(0, 4).forEach((item, i) => {
    const sub =
      i === 3 ? `Young professionals & conscious households — core ${brandName(brand)} buyers` : item.sub;
    statCard(slide, t, {
      x: 0.5 + i * 2.3,
      y: 1.95,
      w: 2.1,
      h: 2.4,
      value: item.value,
      label: item.label,
      sub,
      valueSize: TYPE.statMed.size,
    });
  });

  footer(slide, t);
  return slide;
}

// ---------------------------------------------------------------------------
// 5 — The host
// ---------------------------------------------------------------------------
function miniStat(slide, t, { x, y, w, h, value, label }) {
  card(slide, t, { x, y, w, h });
  fitText(slide, value, {
    x: x + 0.1,
    y: y + 0.06,
    w: w - 0.2,
    h: 0.4,
    fontSize: TYPE.statTiny.size,
    minFontSize: 11,
    fontFace: CAMBRIA,
    bold: true,
    maxLines: 1,
    lineSpacingMultiple: 1.0,
    color: hx(t.panel),
  });
  fitText(slide, String(label).toUpperCase(), {
    x: x + 0.1,
    y: y + 0.46,
    w: w - 0.2,
    h: 0.24,
    fontSize: 8,
    minFontSize: 6.5,
    fontFace: CALIBRI,
    bold: true,
    charSpacing: 0.3,
    maxLines: 1,
    ellipsize: true,
    color: hx(t.muted),
  });
}

// The portrait frame, and the two stat blocks that share the row with it. The
// blocks used to start at the margin and run 2.0in wide apiece; the picture
// takes the first 1.75in of the row, so both columns move right and narrow —
// `miniStat` sets its own numerals to fit, so the values still print whole.
const PORTRAIT = { w: 1.75, h: 2.0 };
const STAT_COLS = { ig: 2.45, yt: 6.12, w: 1.63, pitch: 1.75 };

export function addHostSlide(pptx, { theme: t }) {
  const slide = newSlide(pptx, t);
  const { instagram: ig, youtube: yt } = CREATOR_ANALYTICS;
  const bench = benchmarkFor(ig.followers);

  slideHeader(slide, t, { kicker: "Meet the host", title: "Nitin Joshi", subhead: "" });

  // The face, first — this slide is the only place in the deck the host is a
  // person rather than a set of numbers, and the numbers read differently once
  // there is someone attached to them.
  //
  // A framed tile, not the full-bleed panel DECK_PLAN section 3A asks for: the
  // bundled source is 400x400, which is honest at about 1.6in and mush at 5in.
  // The frame is 1.75 x 2.00 so its bottom edge lands on the same line as the
  // stat cards beside it; the portrait is square and sits centred inside.
  card(slide, t, { x: 0.5, y: 1.35, w: PORTRAIT.w, h: PORTRAIT.h });
  imageFit(slide, {
    x: 0.5,
    y: 1.35,
    w: PORTRAIT.w,
    h: PORTRAIT.h,
    pad: 0.06,
    image: CREATOR_PORTRAIT,
    title: "Nitin Joshi",
  });

  text(slide, `INSTAGRAM · @${ig.handle}`, {
    x: STAT_COLS.ig,
    y: 1.35,
    w: 3.3,
    h: 0.3,
    fontFace: CALIBRI,
    fontSize: 12,
    bold: true,
    color: hx(t.accent),
  });
  const igStats = [
    { value: compact(ig.followers), label: "Followers" },
    { value: compact(ig.reels), label: "Reels published" },
    { value: compact(ig.avgLikes), label: "Avg. likes / reel" },
    { value: compact(ig.avgComments), label: "Avg. comments / reel" },
  ];
  igStats.forEach((s, i) => {
    miniStat(slide, t, {
      x: STAT_COLS.ig + (i % 2) * STAT_COLS.pitch,
      y: 1.75 + Math.floor(i / 2) * 0.85,
      w: STAT_COLS.w,
      h: 0.75,
      ...s,
    });
  });

  text(slide, `YOUTUBE · ${yt.channel}`, {
    x: STAT_COLS.yt,
    y: 1.35,
    w: 3.3,
    h: 0.3,
    fontFace: CALIBRI,
    fontSize: 12,
    bold: true,
    color: hx(t.accent),
  });
  const ytStats = [
    { value: compact(yt.totalViews), label: "Lifetime views" },
    { value: compact(yt.totalVideos), label: "Videos published" },
    { value: compact(yt.channelAvgViews), label: "Avg. views / video" },
    { value: hoursMinutes(yt.avgDurationMin), label: "Avg. episode length" },
  ];
  ytStats.forEach((s, i) => {
    miniStat(slide, t, {
      x: STAT_COLS.yt + (i % 2) * STAT_COLS.pitch,
      y: 1.75 + Math.floor(i / 2) * 0.85,
      w: STAT_COLS.w,
      h: 0.75,
      ...s,
    });
  });

  text(slide, `ENGAGEMENT VS. TYPICAL ACCOUNTS THIS SIZE · @${ig.handle}`, {
    x: 0.5,
    y: 3.55,
    w: 5.2,
    h: 0.3,
    fontFace: CALIBRI,
    fontSize: 10,
    bold: true,
    color: hx(t.ink),
  });
  benchmarkChart(slide, t, {
    x: 0.5,
    y: 3.9,
    w: 5.2,
    h: 1.25,
    rows: [
      { label: `@${ig.handle}`, value: ig.engagementRatePct, highlight: true },
      { label: "Strong for this size", value: bench.strong },
      { label: "Typical for this size", value: bench.median },
    ],
  });

  calloutStrip(slide, t, {
    x: 6.0,
    y: 3.9,
    w: 3.5,
    h: 1.25,
    kicker: `${pct(ig.engagementRatePct)} engagement rate`,
    body: `Well above the ${pct(bench.median)} typical for accounts this size — attention, not just audience.`,
  });

  footer(slide, t);
  return slide;
}

// ---------------------------------------------------------------------------
// 6 — Track record
// ---------------------------------------------------------------------------
// Per row, not per slide: the content panel lets a person choose 3 Instagram
// posts and 2 YouTube videos, and each platform now gets its own row. Four is
// headroom rather than a limit anyone reaches — the point of stating it at all
// is that an earlier version sliced to four across both platforms and silently
// dropped whichever item came last, the one case where a person had
// deliberately chosen something and the file quietly disagreed.
const MAX_ROW_CARDS = 4;

// The grid both rows are laid out on. Three columns at a 9in measure gives a
// 2.88in card, which is the width the titles were written against; a row with
// fewer cards leaves its columns empty rather than stretching two cards to
// 4.4in each, so the two rows read as one grid instead of two unrelated bands.
const MIN_ROW_COLS = 3;

/** "412K views" or "18.4K likes · 312 comments" — whichever the item has. */
function engagementLine(item, isVideo) {
  if (isVideo) {
    if (item.view_count_text) return String(item.view_count_text);
    const views = Number(item.view_count ?? item.views);
    return Number.isFinite(views) && views > 0 ? `${compact(views)} views` : "";
  }
  const likes = Number(item.likes);
  const comments = Number(item.comments);
  const parts = [];
  if (Number.isFinite(likes) && likes > 0) parts.push(`${compact(likes)} likes`);
  if (Number.isFinite(comments) && comments > 0) parts.push(`${compact(comments)} comments`);
  return parts.join(" · ");
}

/**
 * The cards for whatever was actually selected, one list per platform.
 *
 * Kept apart rather than concatenated because the two platforms are counted in
 * different units — a video reports views, a post reports likes and comments —
 * and a single row mixing "11.5K views" with "7,969 likes · 40 comments" under
 * one heading invites the reader to compare two numbers that do not compare.
 *
 * Deliberately title, engagement and a link, and nothing else. No thumbnail:
 * Instagram's `display_url` is a signed CDN link that has usually expired by
 * the time a deck is opened, and a card built around a broken image is worse
 * than one built around a number.
 */
function trackCards(contentMatches) {
  const posts = (contentMatches?.instagram?.posts || [])
    .filter((r) => r?.url)
    .slice(0, MAX_ROW_CARDS)
    .map((r) => {
      // A curated pick knows which brand it is about; the keyword matcher's
      // picks do not, so those fall back to the caption's opening line.
      const caption = String(r.caption || "").replace(/(^|\s)[#@][\w.]+/g, " ").replace(/\s{2,}/g, " ").trim();
      return {
        title: r.curatedBrand || caption.slice(0, 70) || "Instagram post",
        meta: engagementLine(r, false),
        href: r.url,
      };
    });

  const videos = (contentMatches?.youtube?.videos || [])
    .filter((v) => v?.url)
    .slice(0, MAX_ROW_CARDS)
    .map((v) => ({
      title: String(v.curatedBrand || v.title || "YouTube video"),
      meta: engagementLine(v, true),
      href: v.url,
    }));

  return { posts, videos };
}

export function addTrackRecordSlide(pptx, { theme: t, contentMatches }) {
  const slide = newSlide(pptx, t);
  const { posts, videos } = trackCards(contentMatches);

  // The subhead names what is actually on the slide. A marketing deck carries
  // no videos and a podcast deck no posts (`contentLimitsFor`), so a fixed line
  // would be describing a row that isn't there in two of the three offer types.
  // The empty case keeps the general wording — there is nothing to be specific
  // about.
  const kinds = [];
  if (posts.length) kinds.push("posts");
  if (videos.length) kinds.push("videos");
  const what = kinds.length ? `Real ${kinds.join(" and ")}` : "Real posts and videos";
  // "Open any of them" is only printed when every card drawn actually opens.
  // The reference deck made that invitation with no links behind it at all,
  // and a promise the slide doesn't keep is worse than a quieter subhead.
  const all = [...posts, ...videos];
  const allOpen = all.length > 0 && all.every((c) => c.href);

  slideHeader(slide, t, {
    kicker: "Track record",
    title: "Brands We've Worked With",
    subhead: allOpen ? `${what} — open any of them` : what,
  });

  // One row per platform, each under its own heading, named the same way the
  // deck builder names them so what a person picked and what prints are
  // recognisably the same two lists.
  //
  // Separate rows because the units don't compare: the videos row counts views,
  // the posts row counts likes and comments. Both used to sit in one row under
  // "ON THE PODCAST", which was wrong about three cards in four.
  const BAND_TOP = 1.7;
  const BAND_BOTTOM = FOLIO_Y - 0.17;
  const CARD_H = 1.25;
  const LABEL_TO_CARD = 0.35;
  const ROW_H = LABEL_TO_CARD + CARD_H;

  // A shared grid, so a two-card row lines up with a three-card row above it
  // instead of stretching to the same width with fatter cards.
  const cols = Math.max(MIN_ROW_COLS, posts.length, videos.length);
  const gap = cols >= 5 ? 0.13 : 0.18;
  const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
  const titleSize = cols >= 5 ? 9.5 : 10;

  function row(label, cards, labelY) {
    text(slide, label, {
      x: 0.5,
      y: labelY,
      w: 5.0,
      h: 0.25,
      fontFace: CALIBRI,
      fontSize: 10,
      bold: true,
      color: hx(t.accent),
    });
    cards.forEach((c, i) => {
      linkCard(slide, t, {
        x: 0.5 + i * (cardW + gap),
        y: labelY + LABEL_TO_CARD,
        w: cardW,
        h: CARD_H,
        title: c.title,
        meta: c.meta,
        href: c.href,
        titleSize,
      });
    });
  }

  const rows = [];
  if (posts.length) rows.push(["INSTAGRAM POSTS & CLIPS", posts]);
  if (videos.length) rows.push(["YOUTUBE VIDEOS", videos]);

  if (rows.length === 2) {
    // Two rows fill the band exactly: 1.70 label, 2.05 cards, 3.55 label, 3.90
    // cards, bottom edge landing on 5.15 just clear of the folio.
    const spare = BAND_BOTTOM - BAND_TOP - ROW_H * 2;
    rows.forEach(([label, cards], i) => row(label, cards, BAND_TOP + i * (ROW_H + spare)));
  } else if (rows.length === 1) {
    // A single row is centred rather than left at the top, where one row hard
    // against the header reads as a slide that failed to finish drawing.
    const [[label, cards]] = rows;
    row(label, cards, BAND_TOP + (BAND_BOTTOM - BAND_TOP - ROW_H) / 2);
  } else {
    const y = BAND_TOP + (BAND_BOTTOM - BAND_TOP - CARD_H) / 2;
    card(slide, t, { x: 0.5, y, w: CONTENT_W, h: CARD_H });
    fitText(slide, "Posts and videos relevant to this brand are picked in the deck builder before export.", {
      x: 0.75,
      y: y + CARD_H / 2 - 0.2,
      w: CONTENT_W - 0.5,
      h: 0.4,
      fontSize: 10,
      fontFace: CALIBRI,
      color: hx(t.muted),
    });
  }

  footer(slide, t);
  return slide;
}

// ---------------------------------------------------------------------------
// 7 — Creator spotlight
// ---------------------------------------------------------------------------
// Slide 6 proves the work exists as titles and numbers; this one shows it. The
// four thumbnails are brand reels that ran on the host's own account, each tile
// opening the real post — the same promise the previous slide makes, kept in
// pictures rather than in prose.
//
// The grid is four identical tiles with each thumbnail fitted inside its own.
// The sources are screenshots at four different aspect ratios and every one
// carries its hook line along the bottom edge, so squaring them up with a crop
// would cut off the line the reader is meant to read.
const SPOTLIGHT = {
  top: 1.7,
  bottom: FOLIO_Y - 0.17,
  panelW: 5.65,
  gridX: 6.35,
  tileW: 1.5,
  gap: 0.15,
  tilePad: 0.07,
};

export function addCaseStudySlide(pptx, { theme: t }) {
  const slide = newSlide(pptx, t);
  const { top, bottom, panelW, gridX, tileW, gap, tilePad } = SPOTLIGHT;

  slideHeader(slide, t, {
    kicker: "Creator spotlight",
    title: "OGM Recommends Brand Case Study by Nitin Joshi",
    subhead: "Why a founder-led case study does more than a standard ad read",
  });

  const panelH = bottom - top;
  card(slide, t, { x: 0.5, y: top, w: panelW, h: panelH });

  // Evenly divided rather than stacked from the top: four short labels flowed
  // at a fixed pitch leave the bottom third of a 3.45in card empty, which reads
  // as a list that was cut off rather than a list that is finished.
  const pitch = panelH / CASE_STUDY_BENEFITS.length;
  CASE_STUDY_BENEFITS.forEach((label, i) => {
    const y = top + i * pitch + (pitch - 0.3) / 2;
    chip(slide, t, { x: 0.95, y: y + 0.02, d: 0.28, label: String(i + 1), fontSize: 10.5 });
    fitText(slide, label, {
      x: 1.4,
      y,
      w: panelW - 1.15,
      h: 0.3,
      fontSize: 14,
      minFontSize: 10,
      fontFace: CALIBRI,
      bold: true,
      maxLines: 1,
      ellipsize: true,
      lineSpacingMultiple: 1.0,
      color: hx(t.ink),
    });
  });

  const tileH = (panelH - gap) / 2;
  // An id with no thumbnail behind it is dropped rather than drawn empty: the
  // links are hand-maintained in deck/caseStudy.js and the pixels are generated
  // into deck/assets/caseStudy.js, so the two lists can fall out of step.
  CASE_STUDY_CLIPS.filter((clip) => CASE_STUDY_THUMBS[clip.id])
    .slice(0, 4)
    .forEach((clip, i) => {
      const x = gridX + (i % 2) * (tileW + gap);
      const y = top + Math.floor(i / 2) * (tileH + gap);
      card(slide, t, { x, y, w: tileW, h: tileH });
      imageFit(slide, {
        x,
        y,
        w: tileW,
        h: tileH,
        pad: tilePad,
        image: CASE_STUDY_THUMBS[clip.id],
        href: clip.href,
        title: clip.title,
      });
    });

  footer(slide, t);
  return slide;
}

// ---------------------------------------------------------------------------
// 8 — Influencer tiers
// ---------------------------------------------------------------------------
const TIERS = [
  {
    name: "NANO",
    range: "1K – 15K followers",
    points: [
      "Tight-knit, highly-engaged niche communities",
      "Best for: authentic unboxing & first-use content",
      "Often product-led collaborations & sampling",
    ],
  },
  {
    name: "MICRO",
    range: "15K – 100K followers",
    points: [
      "Home, lifestyle and everyday-use creators",
      "Best for: how-to videos, city-led sampling drives",
      "Strong trust with young, urban followers",
    ],
  },
  {
    name: "MACRO",
    range: "100K – 1M+ followers",
    points: [
      "Established lifestyle, wellness & culture voices",
      "Best for: national prestige, big launch moments",
      "Broad reach across metro audiences",
    ],
  },
];

export function addInfluencerTiersSlide(pptx, { theme: t }) {
  const slide = newSlide(pptx, t);

  slideHeader(slide, t, {
    kicker: "Amplification layer",
    title: "OGM Recommends Influencer Marketing",
    subhead: "Nano, micro & macro creators — sized to your budget",
  });

  TIERS.forEach((tier, i) => {
    const x = 0.5 + i * 3.1;
    card(slide, t, { x, y: 1.85, w: 2.85, h: 2.5 });
    text(slide, tier.name, {
      x: x + 0.2,
      y: 2.03,
      w: 2.45,
      h: 0.35,
      fontFace: CAMBRIA,
      fontSize: 17,
      bold: true,
      color: hx(t.accent),
    });
    text(slide, tier.range, {
      x: x + 0.2,
      y: 2.4,
      w: 2.45,
      h: 0.25,
      fontFace: CALIBRI,
      fontSize: 9.5,
      color: hx(t.muted),
    });
    fitText(slide, tier.points.join("\n"), {
      x: x + 0.2,
      y: 2.75,
      w: 2.45,
      h: 1.45,
      fontSize: 9.5,
      minFontSize: 7.5,
      fontFace: CALIBRI,
      lineSpacingMultiple: 1.5,
      color: hx(t.ink),
    });
  });

  fitText(
    slide,
    "Recommended approach: a layered mix — nano and micro creators for authentic, always-on reach, with select macro voices for prestige campaign moments — scaled up or down to match your budget.",
    {
      x: 0.5,
      y: 4.5,
      w: CONTENT_W,
      h: 0.6,
      fontSize: 10.5,
      minFontSize: 8.5,
      fontFace: CALIBRI,
      lineSpacingMultiple: 1.3,
      color: hx(t.muted),
    }
  );

  footer(slide, t);
  return slide;
}

// ---------------------------------------------------------------------------
// 9 — How we work
// ---------------------------------------------------------------------------
const PRE_PRODUCTION = [
  ["Understand Your Story", "A week before the shoot, our team deep-dives into your journey, business and craft."],
  ["Build the Narrative", "We structure the conversation around your story, ensuring the right questions and flow."],
  ["Create Thought Leadership", "We research your category and develop insights that position you as a voice in your space."],
  ["Find the Stories That Matter", "We identify experiences, lessons and opinions that go beyond a typical founder interview."],
  ["Built for Content", "Every conversation is designed to yield strong long-form content and many short-form moments."],
];

const POST_PRODUCTION = [
  ["200+ Website PR", "Your episode is amplified through PR placements across 200+ websites, building credibility and search visibility."],
  ["Instagram Page Distribution", "We push clips through a network of Instagram pages, reaching relevant audiences beyond our own channel."],
];

export function addHowWeWorkSlide(pptx, { theme: t }) {
  const slide = newSlide(pptx, t);

  slideHeader(slide, t, {
    kicker: "How we work",
    title: "Preparation & Amplification",
    subhead: "We don't just record conversations — we prepare for them, and push them out once they're captured.",
  });

  card(slide, t, { x: 0.5, y: 1.75, w: 5.15, h: 3.35 });
  text(slide, "PRE-PRODUCTION IS OUR EDGE", {
    x: 0.75,
    y: 1.9,
    w: 4.65,
    h: 0.3,
    fontFace: CALIBRI,
    fontSize: 11.5,
    bold: true,
    color: hx(t.accent),
  });

  PRE_PRODUCTION.forEach(([title, body], i) => {
    const y = 2.2 + i * 0.55;
    chip(slide, t, { x: 0.75, y: y + 0.04, d: 0.26, label: String(i + 1), fill: t.panel, fontSize: 9.5 });
    text(slide, title, {
      x: 1.13,
      y,
      w: 4.35,
      h: 0.22,
      fontFace: CALIBRI,
      fontSize: 10,
      bold: true,
      color: hx(t.ink),
    });
    fitText(slide, body, {
      x: 1.13,
      y: y + 0.22,
      w: 4.35,
      h: 0.3,
      fontSize: 8,
      minFontSize: 6.5,
      fontFace: CALIBRI,
      maxLines: 2,
      lineSpacingMultiple: 1.2,
      color: hx(t.muted),
    });
  });

  rect(slide, { x: 5.85, y: 1.75, w: 3.65, h: 3.35, fill: { color: hx(t.panel) } });
  text(slide, "POST-PRODUCTION IS OUR PUSH", {
    x: 6.1,
    y: 1.9,
    w: 3.15,
    h: 0.3,
    fontFace: CALIBRI,
    fontSize: 11.5,
    bold: true,
    color: hx(t.gold),
  });
  fitText(slide, "Once the conversation is captured, we make sure it gets seen.", {
    x: 6.1,
    y: 2.22,
    w: 3.15,
    h: 0.4,
    fontSize: 9,
    fontFace: CALIBRI,
    lineSpacingMultiple: 1.3,
    color: hx(t.onDeep),
  });

  POST_PRODUCTION.forEach(([title, body], i) => {
    // The panel runs 1.75 -> 5.10 and pads 0.15 at the top; the last sub-card
    // has to leave the same at the bottom or it sits flush against the panel
    // edge and reads as a crop rather than a card.
    const y = 2.85 + i * 1.1;
    rect(slide, { x: 6.1, y, w: 3.15, h: 1.0, fill: { color: hx(t.deep) } });
    text(slide, title, {
      x: 6.28,
      y: y + 0.1,
      w: 2.8,
      h: 0.28,
      fontFace: CALIBRI,
      fontSize: 10.5,
      bold: true,
      color: hx(t.gold),
    });
    fitText(slide, body, {
      x: 6.28,
      y: y + 0.4,
      w: 2.8,
      h: 0.55,
      fontSize: 8.5,
      minFontSize: 7,
      fontFace: CALIBRI,
      maxLines: 4,
      lineSpacingMultiple: 1.25,
      color: hx(t.onDeep),
    });
  });

  footer(slide, t);
  return slide;
}

// ---------------------------------------------------------------------------
// 10 — The package
// ---------------------------------------------------------------------------
// Platform tags rather than the reference deck's emoji: emoji render as colour
// bitmaps that fight the palette and vary by PowerPoint build, and a tag says
// which surface the deliverable lands on, which the emoji did not.
const PACKAGE_TAGS = ["YT", "IG", "YT", "IG", "FB", "ALL"];

export function addPackageSlide(pptx, { theme: t, offerType }) {
  const slide = newSlide(pptx, t);
  const offer = OFFER_VARIANTS[offerType] || OFFER_VARIANTS.podcast;
  const items = offer.whatYouGet.items.slice(0, 6);

  slideHeader(slide, t, {
    kicker: "The package",
    // Named only where the podcast is actually on the table. A marketing-only
    // deck's package is a creator roster (`OFFER_VARIANTS.marketing`), and
    // titling that "Founder Led Podcast" would name a service the prospect was
    // never offered — the same reason slide 9 is printed conditionally.
    title: offerIncludes(offerType, "podcast") ? "OGM Recommends Founder Led Podcast" : "OGM Recommends",
    subhead: offer.whatYouGet.subtitle,
  });

  items.forEach((item, i) => {
    const x = 0.5 + (i % 3) * 3.05;
    const y = 1.85 + Math.floor(i / 3) * 1.6;
    card(slide, t, { x, y, w: 2.9, h: 1.4 });
    chip(slide, t, { x: x + 0.18, y: y + 0.18, d: 0.4, label: PACKAGE_TAGS[i] || "OGM", fontSize: 9 });
    fitText(slide, item.title, {
      x: x + 0.18,
      y: y + 0.62,
      w: 2.54,
      h: 0.3,
      fontSize: 11.5,
      minFontSize: 9,
      fontFace: CALIBRI,
      bold: true,
      maxLines: 1,
      ellipsize: true,
      color: hx(t.ink),
    });
    fitText(slide, item.description, {
      x: x + 0.18,
      y: y + 0.92,
      w: 2.54,
      h: 0.42,
      fontSize: 8.5,
      minFontSize: 7,
      fontFace: CALIBRI,
      maxLines: 3,
      lineSpacingMultiple: 1.25,
      color: hx(t.muted),
    });
  });

  footer(slide, t);
  return slide;
}

// ---------------------------------------------------------------------------
// 11 — The ask
// ---------------------------------------------------------------------------
export function addAskSlide(pptx, { theme: t, brand, offerType }) {
  const slide = newSlide(pptx, t, { dark: true });
  const offer = OFFER_VARIANTS[offerType] || OFFER_VARIANTS.podcast;

  rule(slide, { x: 0.7, y: 1.85, w: 1.5, weightPt: 3, color: t.gold });
  text(slide, "THE INVITATION", {
    x: 0.7,
    y: 2.0,
    w: CONTENT_W - 0.4,
    h: 0.35,
    fontFace: CALIBRI,
    fontSize: 12,
    bold: true,
    charSpacing: 1.5,
    color: hx(t.gold),
  });

  fitText(slide, "Let's build the campaign together", {
    x: 0.7,
    y: 2.4,
    w: 8.6,
    h: 0.9,
    fontSize: TYPE.closerTitle.size,
    minFontSize: 24,
    fontFace: CAMBRIA,
    bold: true,
    maxLines: 2,
    lineSpacingMultiple: 1.05,
    color: "FFFFFF",
  });

  fitText(slide, offer.whyPartner.ask(brandName(brand)), {
    x: 0.7,
    y: 3.35,
    w: 8.6,
    h: 0.55,
    fontSize: TYPE.coverSub.size,
    minFontSize: 11,
    fontFace: CALIBRI,
    maxLines: 2,
    lineSpacingMultiple: 1.3,
    color: hx(t.onDeep),
  });

  // The reference deck closed on "Commercials — let's discuss." and gave the
  // reader nothing to act on. A named next step is the whole job of a closing
  // slide. (This used to append a `contact` email/phone, but no caller ever
  // passed one, so those two lines could never print.)
  text(slide, "Commercials — let's discuss.", {
    x: 0.7,
    y: 4.05,
    w: 8.6,
    h: 0.35,
    fontFace: CALIBRI,
    fontSize: 12,
    bold: true,
    color: hx(t.gold),
  });

  footer(slide, t, { onDark: true });
  return slide;
}

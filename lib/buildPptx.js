import PptxGenJS from 'pptxgenjs';
import { CREATOR_ANALYTICS } from './creatorStats.js';
import { resolveStyle } from './deckStyles.js';

// ==========================================
// THEME — every slide function takes `t`, the resolved style from
// lib/deckStyles.js, and reads its colours and typefaces off it. Nothing here
// hardcodes a colour: a hex literal in this file is a style that only one deck
// can use. The "classic" style reproduces the original reference deck exactly
// (FFFFFF bg, 000000/222222 text, 555555 muted, CCCCCC dividers, F9F9F9 card
// bg, FF4D4D brand-red accent), so an existing report renders unchanged.
// ==========================================

// Canvas is LAYOUT_WIDE (13.333in x 7.5in) — every position below is measured
// against that real canvas, not guessed/scaled from a smaller layout.
const PAGE_W = 13.333;
const CONTENT_X = 0.67;
const CONTENT_W = 12.0;

function hex(c) { return c.startsWith('#') ? c.slice(1) : c; }

// 166,309,379 is unreadable on a slide someone looks at for four seconds. The
// rest of the deck already talks in "2M+" and "500M+", so creator figures use
// the same shorthand rather than introducing lakh/crore alongside it.
function compact(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(Math.round(n / 1e5) / 10).toString()}M`;
  if (abs >= 1e4) return `${(Math.round(n / 100) / 10).toString()}K`;
  return n.toLocaleString();
}

// "111" is a runtime, not a stat — nobody reads it as an hour and fifty-one
// minutes without doing the division themselves.
function hoursMinutes(totalMinutes) {
  if (typeof totalMinutes !== 'number' || !Number.isFinite(totalMinutes)) return '—';
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ==========================================
// OPEN GREY MEDIA — static offer content, verbatim from the reference deck.
// Brand-independent facts about what Open Grey Media provides — one source
// of truth so the numbers aren't scattered across slide-building functions.
// ==========================================
const OPEN_GREY_OFFER = {
  opportunity: [
    { value: '500M+', label: 'Active Indian Social Media Users', sub: 'Fastest growing digital audience globally' },
    { value: '40%', label: 'Annual Podcast Growth in India', sub: 'Outpacing the global average of 15%' },
    { value: '85%', label: 'Content Consumed via Short-Form Video', sub: 'Reels & Shorts dominate discovery' },
  ],
  reach: [
    { value: '2M+', label: 'Followers', sub: 'Across YouTube and Instagram combined' },
    { value: '15M+', label: 'Monthly Views', sub: 'On long-form episodes, shorts, and reels' },
    { value: '2M+', label: 'Total Interactions', sub: 'Likes, comments, shares, and saves' },
    { value: '76%', label: 'Audience Aged 18-34', sub: 'Focused on Business, Finance & Startups' },
  ],
  whatYouGet: [
    { title: 'Full Episode Exposure', description: 'Your brand featured in the complete podcast video on our main YouTube channel.' },
    { title: '20 Instagram Reels', description: 'Short-form reels crafted from your episode, maximizing algorithmic reach.' },
    { title: '10-20 YouTube Shorts', description: 'Bite-sized highlights driving discovery and subscriptions.' },
    { title: 'Premium Story Feature', description: 'Your best clip featured as a Story on our main Instagram profile.' },
    { title: 'FACEBOOK', description: '1 Podcast episode + 12 Reels' },
    { title: 'All-Platform Dominance', description: 'From long-form YouTube to short reels — everywhere at once.' },
  ],
  // Past-work proof. Fixed on every deck — edit here, not on the website.
  // Leave the array empty and the Proof slide drops out of the deck entirely,
  // which is the safe default: a placeholder result in front of a client is
  // worse than no proof slide at all.
  proof: [
    // { brand: 'Palmonas', work: '1 episode + 20 reels', result: '2.4M views, 18K new followers' },
  ],
  testimonial: {
    quote: '',   // e.g. 'The episode sold out our launch in six days.'
    author: '',  // e.g. 'Riya Sharma, Founder of Palmonas'
  },

  // Pricing. Also fixed per deck and edited here rather than on the website.
  // Blank `yourInvestment` drops the Investment slide out of the deck, which
  // is the right default if price is something you'd rather discuss on a call.
  pricing: {
    lineItems: [
      { label: 'Podcast production + studio', value: '' },
      { label: '20 Instagram Reels (agency rate)', value: '' },
      { label: '10-20 YouTube Shorts', value: '' },
      { label: 'Multi-platform distribution', value: '' },
    ],
    totalValue: '',
    yourInvestment: '',   // e.g. 'Rs 75,000' — set this to make the slide appear
    riskReversal: '',     // e.g. "If it doesn't hit 500K views in 30 days, the next one is free."
  },

  whyPartner: [
    'Share your journey, challenges, and success stories with a motivated entrepreneurial audience',
    'Position yourself as a thought leader in your industry',
    'Build brand visibility across multiple platforms with professionally curated content',
    'Network with other business leaders and create collaborations beyond the podcast',
  ],
};

// Fixed-position text boxes overlap when content is longer than expected —
// estimate wrapped height from character count so callers can cascade the
// next element below it instead of guessing a fixed offset.
// `t` only for its charWidth: Georgia sets about 8% wider than Helvetica at the
// same point size, so a shared constant here would let the Editorial style
// silently overflow every box this function measures.
function estimateTextHeight(t, text, { fontSize, width, lineSpacing }) {
  if (!text) return 0;
  const avgCharWidthPt = fontSize * (t?.charWidth || 0.52);
  const widthPt = width * 72;
  const charsPerLine = Math.max(Math.floor(widthPt / avgCharWidthPt), 8);
  const paragraphs = String(text).split('\n');
  let totalLines = 0;
  for (const para of paragraphs) {
    totalLines += Math.max(Math.ceil(para.length / charsPerLine), 1);
  }
  const lineHeightPt = lineSpacing || fontSize * 1.3;
  return (totalLines * lineHeightPt) / 72;
}

// Defense in depth alongside dynamic sizing — caps worst-case outliers so a
// single very long field can't push content off the bottom of the slide.
function truncate(text, maxLen) {
  if (!text) return text;
  const s = String(text);
  return s.length > maxLen ? `${s.slice(0, maxLen - 1).trimEnd()}…` : s;
}

// Standard slide header: full-width black top bar, title, subtitle, divider —
// matches the reference deck's header block used on slides 2-7 (positions
// confirmed against the real file). `titleY` lets slide 5 start slightly
// higher to make room for its 3-row card grid, matching the reference.
function addSlideHeader(t, slide, pptx, title, subtitle, titleY = 0.69) {
  slide.background = { color: t.bg };

  // Some styles drop the bar entirely. Drawing it at zero height would still
  // emit a shape, and PowerPoint renders a hairline for one.
  if (t.headerBarH > 0) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: PAGE_W, h: t.headerBarH,
      fill: { color: t.accent },
    });
  }

  if (title) {
    slide.addText(title, {
      x: CONTENT_X, y: titleY, w: CONTENT_W, h: 0.69,
      fontSize: 33, bold: true, color: t.textMain, fontFace: t.fontBody,
    });
  }
  if (subtitle) {
    slide.addText(subtitle, {
      x: CONTENT_X, y: titleY + 0.69, w: CONTENT_W, h: 0.41,
      fontSize: 16.5, color: t.textMuted, fontFace: t.fontBody,
    });
  }

  slide.addShape(pptx.ShapeType.rect, {
    x: CONTENT_X, y: titleY + 1.24, w: CONTENT_W, h: 0.01,
    fill: { color: t.border },
  });
}

// A PowerPoint hyperlink is invisible until it is hovered, so a card that is
// technically clickable reads as a dead end to anyone scrolling the deck. This
// is the visible affordance — every video on every slide gets one instead of a
// poster image.
function addViewLink(t, slide, { x, y, w, url }) {
  if (!url) return;
  slide.addText('View ↗', {
    x, y, w, h: 0.26,
    fontSize: 11, bold: true, color: t.brandColor, fontFace: t.fontBody,
    underline: true, hyperlink: { url },
  });
}

function addFooter(t, slide, pptx) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 6.99, w: 12.0, h: 0.01,
    fill: { color: t.border },
  });
  slide.addText('Private & Confidential | Prepared by Open Grey Media', {
    x: 0.5, y: 7.06, w: 12.0, h: 0.28,
    fontSize: 9.5, color: t.textMuted, fontFace: t.fontBody, align: 'left',
  });
}

// ==========================================
// 1. COVER SLIDE
// ==========================================
function addCoverSlide(t, pptx, rd, brandName) {
  const slide = pptx.addSlide();
  slide.background = { color: t.bg };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 2.5, w: 1, h: 0.05,
    fill: { color: t.brandColor },
  });

  slide.addText(brandName.toUpperCase(), {
    x: 0.5, y: 2.7, w: 9.0, h: 1.0,
    fontSize: 44, bold: true, color: t.textMain, fontFace: t.fontDisplay,
  });

  const tagline = rd?.about?.tagline || 'Podcast & Influencer Marketing Proposal';
  slide.addText(tagline, {
    x: 0.55, y: 3.77, w: 7.99, h: 0.79,
    fontSize: 18, color: t.textMuted, fontFace: t.fontDisplay,
  });

  addFooter(t, slide, pptx);
}

// Engagement rate falls predictably as an account grows, so a single flat
// "industry average" would flatter small accounts and unfairly damn large
// ones. Benchmarks are tiered by follower count instead — these are widely
// published reference ranges for Instagram, not measured by us, and the
// slide labels them as typical ranges rather than precise claims.
const ER_BENCHMARKS = [
  { maxFollowers: 10000, median: 3.5 },
  { maxFollowers: 100000, median: 1.9 },
  { maxFollowers: 1000000, median: 1.2 },
  { maxFollowers: Infinity, median: 0.9 },
];

function benchmarkFor(followers) {
  const tier = ER_BENCHMARKS.find(b => (followers || 0) <= b.maxFollowers) || ER_BENCHMARKS[ER_BENCHMARKS.length - 1];
  return { median: tier.median, strong: Math.round(tier.median * 2 * 10) / 10 };
}

// Horizontal comparison bars drawn from plain rectangles — a real bar chart
// would drag in a legend and axes this doesn't need. Returns the y position
// just below the block it drew.
function addBenchmarkBars(t, slide, pptx, { x, y, w, rows }) {
  const labelW = 1.85;
  const valueW = 0.75;
  const trackW = w - labelW - valueW - 0.2;
  const rowH = 0.30;
  const max = Math.max(...rows.map(r => r.value), 0.1);

  rows.forEach((row, i) => {
    const rowY = y + i * rowH;
    slide.addText(row.label, {
      x, y: rowY, w: labelW, h: rowH,
      fontSize: 10.5, color: t.textMuted, fontFace: t.fontBody, valign: 'middle',
    });
    // Track behind the bar, so short bars still read as "out of" something.
    slide.addShape(pptx.ShapeType.rect, {
      x: x + labelW, y: rowY + 0.09, w: trackW, h: 0.13,
      fill: { color: t.trackBg }, line: { type: 'none' },
    });
    const barW = Math.max((row.value / max) * trackW, 0.03);
    slide.addShape(pptx.ShapeType.rect, {
      x: x + labelW, y: rowY + 0.09, w: barW, h: 0.13,
      fill: { color: row.highlight ? t.brandColor : t.barMuted }, line: { type: 'none' },
    });
    slide.addText(`${row.value}%`, {
      x: x + labelW + trackW + 0.1, y: rowY, w: valueW, h: rowH,
      fontSize: 10.5, bold: !!row.highlight,
      color: row.highlight ? t.brandColor : t.textMuted,
      fontFace: t.fontBody, valign: 'middle',
    });
  });

  return y + rows.length * rowH;
}

// ==========================================
// 2. INSTAGRAM ANALYTICS (real, measured data)
// ==========================================
function addInstagramSlide(t, pptx, rd) {
  const slide = pptx.addSlide();
  const ig = rd?.instagramAnalytics;
  addSlideHeader(t, slide, pptx, 'Instagram Analytics', ig ? `@${ig.handle}` : 'Data unavailable');

  if (!ig) {
    slide.addText(rd?.instagramInsight || 'Instagram analytics could not be measured for this profile.', {
      x: CONTENT_X, y: 2.3, w: CONTENT_W, h: 1.5, fontSize: 13, color: t.textMuted, fontFace: t.fontBody,
    });
    addFooter(t, slide, pptx);
    return;
  }

  const metrics = [
    { label: 'FOLLOWERS', value: (ig.followers ?? 0).toLocaleString() },
    { label: 'TOTAL POSTS', value: (ig.totalPosts ?? 0).toLocaleString() },
    { label: 'AVG. LIKES/POST', value: String(ig.avgLikes ?? '-') },
    { label: 'ENGAGEMENT RATE', value: `${ig.engagementRatePct ?? '-'}%` },
  ];
  const colXs = [0.67, 3.80, 6.93, 10.07];
  metrics.forEach((m, i) => {
    slide.addShape(pptx.ShapeType.rect, {
      x: colXs[i], y: 2.20, w: 0.07, h: 0.96,
      fill: { color: t.brandColor },
    });
    slide.addText(m.label, {
      x: colXs[i] + 0.13, y: 2.20, w: 2.80, h: 0.41,
      fontSize: 12.4, color: t.textMuted, fontFace: t.fontBody,
    });
    slide.addText(m.value, {
      x: colXs[i] + 0.13, y: 2.61, w: 2.80, h: 0.55,
      fontSize: 24.8, bold: true, color: t.textMain, fontFace: t.fontBody,
    });
  });

  slide.addText('CONTENT MIX', {
    x: CONTENT_X, y: 3.38, w: 5.33, h: 0.41,
    fontSize: 16.5, bold: true, color: t.accent, fontFace: t.fontBody,
  });
  if (ig.contentMix?.length > 0) {
    slide.addChart(pptx.ChartType.pie, [{
      name: 'Content Mix',
      labels: ig.contentMix.map(c => c.type),
      values: ig.contentMix.map(c => c.percentage),
    }], {
      x: CONTENT_X, y: 3.70, w: 5.7, h: 1.70,
      chartColors: [hex(t.accent), hex(t.textMuted), hex(t.brandColor), hex(t.chartFourth)],
      showLegend: true, legendPos: 'r', legendFontSize: 10, legendColor: t.textMain,
      showPercent: true, dataLabelFontSize: 10, dataLabelColor: t.onAccent,
    });
  } else {
    slide.addText('Not enough recent posts to break down content mix.', {
      x: CONTENT_X, y: 3.85, w: 5.7, h: 0.5, fontSize: 11, italic: true, color: t.textMuted, fontFace: t.fontBody,
    });
  }

  // Engagement rate against tier benchmarks — turns a bare percentage into a
  // visible gap, which is the actual selling point of this slide.
  const bench = benchmarkFor(ig.followers);
  const brandEr = Number(ig.engagementRatePct) || 0;
  slide.addText('ENGAGEMENT VS. TYPICAL ACCOUNTS THIS SIZE', {
    x: CONTENT_X, y: 5.52, w: 5.7, h: 0.28,
    fontSize: 12.5, bold: true, color: t.accent, fontFace: t.fontBody,
  });
  addBenchmarkBars(t, slide, pptx, {
    x: CONTENT_X, y: 5.85, w: 5.7,
    rows: [
      { label: `@${ig.handle}`, value: brandEr, highlight: true },
      { label: 'Typical account', value: bench.median },
      { label: 'Strong performers', value: bench.strong },
    ],
  });

  slide.addText('WHAT THIS MEANS', {
    x: 6.57, y: 3.52, w: 5.33, h: 0.28,
    fontSize: 16.5, bold: true, color: t.accent, fontFace: t.fontBody,
  });
  const insight = truncate(rd?.instagramInsight, 700);
  if (insight) {
    const insightOpts = { fontSize: 13.8, width: 6.16, lineSpacing: 18 };
    slide.addText(insight, {
      x: 6.68, y: 3.88, w: insightOpts.width, h: Math.min(estimateTextHeight(t, insight, insightOpts), 3.0),
      fontSize: insightOpts.fontSize, color: t.textMain, fontFace: t.fontBody, lineSpacing: insightOpts.lineSpacing,
    });
  }

  addFooter(t, slide, pptx);
}

// ==========================================
// 3. THE OPPORTUNITY (Open Grey Media offer — brand-independent)
// ==========================================
function addOpportunitySlide(t, pptx) {
  const slide = pptx.addSlide();
  addSlideHeader(t, slide, pptx, 'The Opportunity', "India's podcast & short-form video audience is exploding");

  const items = OPEN_GREY_OFFER.opportunity;
  const boxW = 3.87;
  const xs = [0.67, 4.73, 8.80];
  items.forEach((item, i) => {
    const x = xs[i];
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 2.34, w: boxW, h: 2.61,
      fill: { color: t.lightBg }, line: { type: 'none' },
    });
    slide.addText(item.value, {
      x: x + 0.20, y: 2.55, w: boxW - 0.40, h: 0.76,
      fontSize: 41, bold: true, color: t.accent, fontFace: t.fontBody,
    });
    slide.addText(item.label, {
      x: x + 0.20, y: 3.37, w: boxW - 0.40, h: 0.76,
      fontSize: 15, bold: true, color: t.textMain, fontFace: t.fontBody,
    });
    slide.addText(item.sub, {
      x: x + 0.20, y: 4.06, w: boxW - 0.40, h: 0.76,
      fontSize: 12.4, color: t.textMuted, fontFace: t.fontBody,
    });
  });

  addFooter(t, slide, pptx);
}

// ==========================================
// 4. OUR REACH & AUDIENCE (Open Grey Media offer)
// ==========================================
function addReachAudienceSlide(t, pptx) {
  const slide = pptx.addSlide();
  addSlideHeader(t, slide, pptx, 'Our Reach & Audience', 'The distribution network behind every episode');

  const items = OPEN_GREY_OFFER.reach;
  const boxW = 2.80;
  const xs = [0.67, 3.67, 6.67, 9.67];
  items.forEach((item, i) => {
    const x = xs[i];
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 2.34, w: boxW, h: 2.50,
      fill: { color: t.lightBg }, line: { type: 'none' },
    });
    slide.addText(item.value, {
      x: x + 0.16, y: 2.61, w: boxW - 0.32, h: 0.69,
      fontSize: 33, bold: true, color: t.accent, fontFace: t.fontBody,
    });
    slide.addText(item.label, {
      x: x + 0.16, y: 3.30, w: boxW - 0.32, h: 0.83,
      fontSize: 13.8, bold: true, color: t.textMain, fontFace: t.fontBody,
    });
    const subOpts = { fontSize: 11, width: boxW - 0.32, lineSpacing: 13 };
    slide.addText(item.sub, {
      x: x + 0.16, y: 4.13, w: subOpts.width, h: Math.min(estimateTextHeight(t, item.sub, subOpts), 0.9),
      fontSize: subOpts.fontSize, color: t.textMuted, fontFace: t.fontBody, lineSpacing: subOpts.lineSpacing,
    });
  });

  addFooter(t, slide, pptx);
}

// ==========================================
// OUR CREATOR'S NUMBERS — the measured figures behind the reach claims on the
// previous slide. Brand-independent, so it takes no report: everything comes
// from lib/creatorStats.js, which scripts/build-creator-stats.mjs pre-computes
// from "nitin josi data/". That 1.9MB of scrape has no business being parsed
// in a browser, which is where this file runs.
// ==========================================
const STAT_ROW_YS = [2.52, 3.62];
const STAT_TILE_H = 0.86;

// 2x2 grid of the same stat tile the Instagram slide uses — red vertical rule,
// muted label, big value.
function addStatTileGrid(t, slide, pptx, { x, w, tiles }) {
  const gutter = 0.30;
  const colW = (w - gutter) / 2;
  // `tile`, not `t` — `t` is the theme, and shadowing it here silently painted
  // every stat tile with undefined colours.
  tiles.slice(0, 4).forEach((tile, i) => {
    const tx = x + (i % 2) * (colW + gutter);
    const ty = STAT_ROW_YS[Math.floor(i / 2)];
    slide.addShape(pptx.ShapeType.rect, {
      x: tx, y: ty, w: 0.07, h: STAT_TILE_H,
      fill: { color: t.brandColor },
    });
    slide.addText(tile.label, {
      x: tx + 0.15, y: ty, w: colW - 0.15, h: 0.32,
      fontSize: 11, color: t.textMuted, fontFace: t.fontBody,
    });
    slide.addText(tile.value, {
      x: tx + 0.15, y: ty + 0.31, w: colW - 0.15, h: 0.52,
      fontSize: 21, bold: true, color: t.textMain, fontFace: t.fontBody,
    });
  });
}

function addCreatorAnalyticsSlide(t, pptx) {
  const ig = CREATOR_ANALYTICS?.instagram;
  const yt = CREATOR_ANALYTICS?.youtube;
  if (!ig && !yt) return;

  const slide = pptx.addSlide();
  // No subtitle: the numbers below are the whole argument, and a line of
  // throat-clearing above them only delays it. addSlideHeader keeps the divider
  // at a fixed offset, so nothing below shifts.
  addSlideHeader(t, slide, pptx, 'Nitin Joshi');

  const halfW = 5.70;
  const leftX = CONTENT_X;          // 0.67
  const rightX = 6.96;

  if (ig) {
    slide.addText(`INSTAGRAM  ·  @${ig.handle}`, {
      x: leftX, y: 2.12, w: halfW, h: 0.30,
      fontSize: 13, bold: true, color: t.accent, fontFace: t.fontBody,
    });
    addStatTileGrid(t, slide, pptx, {
      x: leftX, w: halfW,
      tiles: [
        { label: 'FOLLOWERS', value: compact(ig.followers) },
        { label: 'REELS PUBLISHED', value: compact(ig.reels) },
        { label: 'AVG. LIKES / REEL', value: compact(ig.avgLikes) },
        { label: 'AVG. COMMENTS / REEL', value: compact(ig.avgComments) },
      ],
    });
  }

  if (yt) {
    slide.addText(`YOUTUBE  ·  ${yt.channel}`, {
      x: rightX, y: 2.12, w: halfW, h: 0.30,
      fontSize: 13, bold: true, color: t.accent, fontFace: t.fontBody,
    });
    // Subscriber count is deliberately absent. At 255K it is the one YouTube
    // figure that undersells the channel — 166M lifetime views off 255K
    // subscribers is the interesting fact, and leading with the subscriber
    // number invites the prospect to anchor on the smallest one.
    //
    // Views lead, mirroring FOLLOWERS in the Instagram column: the top-left
    // tile is the headline number on both sides.
    addStatTileGrid(t, slide, pptx, {
      x: rightX, w: halfW,
      tiles: [
        { label: 'LIFETIME VIEWS', value: compact(yt.totalViews) },
        { label: 'VIDEOS PUBLISHED', value: compact(yt.totalVideos) },
        // Channel-wide, not the 31-episode sample — see the note in
        // scripts/build-creator-stats.mjs on why those two differ by 13x.
        { label: 'AVG. VIEWS / VIDEO', value: compact(yt.channelAvgViews) },
        { label: 'AVG. EPISODE LENGTH', value: hoursMinutes(yt.avgDurationMin) },
      ],
    });
  }

  // Divider between the two halves, spanning only the tile block.
  slide.addShape(pptx.ShapeType.rect, {
    x: 6.66, y: 2.12, w: 0.01, h: STAT_ROW_YS[1] + STAT_TILE_H - 2.12,
    fill: { color: t.border },
  });

  if (!ig) {
    addFooter(t, slide, pptx);
    return;
  }

  // Same tiered benchmark the prospect's Instagram slide is scored against, so
  // the two slides can be read side by side rather than in different units.
  const bench = benchmarkFor(ig.followers);
  const er = Number(ig.engagementRatePct) || 0;

  // Full content width rather than the left half: the right half used to carry
  // a "what this means" paragraph, and with that gone a half-width chart would
  // just look like something fell off the slide.
  slide.addText('ENGAGEMENT VS. TYPICAL ACCOUNTS THIS SIZE', {
    x: leftX, y: 4.85, w: CONTENT_W, h: 0.28,
    fontSize: 12.5, bold: true, color: t.accent, fontFace: t.fontBody,
  });
  addBenchmarkBars(t, slide, pptx, {
    x: leftX, y: 5.20, w: CONTENT_W,
    rows: [
      { label: `@${ig.handle}`, value: er, highlight: true },
      { label: 'Typical account', value: bench.median },
      { label: 'Strong performers', value: bench.strong },
    ],
  });

  addFooter(t, slide, pptx);
}

// ==========================================
// BRANDS WE'VE WORKED WITH — three Instagram collabs and three podcast
// episodes, every card hyperlinked to the real post. Seeded from
// lib/creatorStats.js but stored per report, so either row can be swapped for
// something closer to the prospect's category before the deck goes out.
//
// No poster images anywhere: a card is its text plus a visible "View" link.
// The two rows differ only in what identifies them — an Instagram collab has no
// video title, so its brand name leads; a podcast episode's title already names
// the brand ("How Chai Sutta Bar Actually Started?"), so the title leads.
// ==========================================
function usableCollabs(list) {
  return (list || []).filter(c => c?.brand?.trim() && c?.url?.trim()).slice(0, 3);
}

// Brand names are typed by hand and vary wildly in length — "ACKO" next to
// "JHS Svendgaard Laboratories Ltd", and a multi-partner collab can run to
// fifty characters. These boxes are one line tall, so anything that wraps
// lands on the line beneath it. Shrink a step first, since the brand's name is
// the whole point of the card; the truncate() limit at each call site is then
// the longest string that still fits on one line at the reduced size.
function brandFontSize(brand, { base, maxChars }) {
  return String(brand || '').length > maxChars ? base - 3.5 : base;
}

function addBrandCollabsSlide(t, pptx, rd) {
  const igRow = usableCollabs(rd?.brandCollabs?.instagram);
  const ytRow = usableCollabs(rd?.brandCollabs?.youtube);
  if (!igRow.length && !ytRow.length) return;

  const slide = pptx.addSlide();
  addSlideHeader(t, slide, pptx, "Brands We've Worked With", 'Real collaborations and episodes — open any of them');

  const boxW = 3.87;
  const xs = [0.67, 4.73, 8.80];

  // Shared card shell: tinted panel, red left rule, whole thing clickable.
  function addCard(x, y, h, link) {
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: boxW, h,
      fill: { color: t.lightBg }, line: { type: 'none' }, hyperlink: link,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: 0.08, h,
      fill: { color: t.brandColor },
    });
  }

  // ---- Instagram row: brand name leads, since a post has no title ----
  if (igRow.length) {
    slide.addText('INSTAGRAM COLLABORATIONS', {
      x: CONTENT_X, y: 2.10, w: CONTENT_W, h: 0.28,
      fontSize: 12.5, bold: true, color: t.accent, fontFace: t.fontBody,
    });

    const top = 2.45;
    const cardH = 1.85;
    igRow.forEach((c, i) => {
      const x = xs[i];
      const link = { url: c.url };
      addCard(x, top, cardH, link);

      slide.addText(truncate(c.brand, 34), {
        x: x + 0.26, y: top + 0.16, w: boxW - 0.45, h: 0.44,
        fontSize: brandFontSize(c.brand, { base: 17, maxChars: 26 }),
        bold: true, color: t.textMain, fontFace: t.fontBody,
        hyperlink: link,
      });

      const caption = truncate(c.caption || '', 110);
      if (caption) {
        const opts = { fontSize: 10.5, width: boxW - 0.45, lineSpacing: 13 };
        slide.addText(caption, {
          x: x + 0.26, y: top + 0.64, w: opts.width,
          h: Math.min(estimateTextHeight(t, caption, opts), 0.62),
          fontSize: opts.fontSize, color: t.textMuted,
          fontFace: t.fontBody, lineSpacing: opts.lineSpacing,
        });
      }

      addViewLink(t, slide, { x: x + 0.26, y: top + 1.42, w: boxW - 0.45, url: c.url });
    });
  }

  // ---- Podcast row: the episode title already names the brand ----
  if (ytRow.length) {
    slide.addText('ON THE PODCAST', {
      x: CONTENT_X, y: 4.60, w: CONTENT_W, h: 0.28,
      fontSize: 12.5, bold: true, color: t.accent, fontFace: t.fontBody,
    });

    const top = 4.95;
    const cardH = 1.55;
    ytRow.forEach((c, i) => {
      const x = xs[i];
      const link = { url: c.url };
      addCard(x, top, cardH, link);

      // Fall back to the brand name if a hand-added entry has no title, so the
      // card never renders as an empty panel with a link under it.
      const title = truncate(c.title?.trim() || c.brand, 96);
      const opts = { fontSize: 13.5, width: boxW - 0.45, lineSpacing: 16 };
      slide.addText(title, {
        x: x + 0.26, y: top + 0.16, w: opts.width,
        h: Math.min(estimateTextHeight(t, title, opts), 0.85),
        fontSize: opts.fontSize, bold: true, color: t.textMain,
        fontFace: t.fontBody, lineSpacing: opts.lineSpacing,
        hyperlink: link,
      });

      addViewLink(t, slide, { x: x + 0.26, y: top + 1.14, w: boxW - 0.45, url: c.url });
    });
  }

  addFooter(t, slide, pptx);
}

// ==========================================
// 5. WHAT YOUR BRAND GETS (Open Grey Media offer)
// ==========================================
function addWhatYouGetSlide(t, pptx) {
  const slide = pptx.addSlide();
  addSlideHeader(t, slide, pptx, 'What Your Brand Gets', 'Every episode becomes a full-scale distribution campaign', 0.48);

  const items = OPEN_GREY_OFFER.whatYouGet;
  const colW = 5.87;
  const rowH = 1.25;
  const colXs = [0.59, 6.72];
  const rowYs = [2.00, 3.65, 5.30];
  items.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = colXs[col];
    const y = rowYs[row];

    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: colW, h: rowH,
      fill: { color: t.bg }, line: { color: t.border },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: 0.08, h: rowH,
      fill: { color: t.brandColor },
    });
    slide.addText(item.title, {
      x: x + 0.27, y: y + 0.11, w: colW - 0.5, h: 0.34,
      fontSize: 16.5, bold: true, color: t.textMain, fontFace: t.fontBody,
    });
    const descOpts = { fontSize: 12.4, width: colW - 0.5, lineSpacing: 15 };
    slide.addText(item.description, {
      x: x + 0.27, y: y + 0.46, w: descOpts.width, h: Math.min(estimateTextHeight(t, item.description, descOpts), rowH - 0.5),
      fontSize: descOpts.fontSize, color: t.textMuted, fontFace: t.fontBody, lineSpacing: descOpts.lineSpacing,
    });
  });

  addFooter(t, slide, pptx);
}

// ==========================================
// WHY THIS FITS — bridges "our audience" to "your customer". Without this
// the prospect has to connect those dots themselves, and most won't.
// ==========================================
function addWhyThisFitsSlide(t, pptx, rd, brandName) {
  const slide = pptx.addSlide();
  addSlideHeader(t, slide, pptx, 'Why This Fits', `Where ${brandName} and our audience overlap`);

  const text = rd?.audienceFit;
  if (text) {
    const opts = { fontSize: 15, width: CONTENT_W, lineSpacing: 24 };
    slide.addText(truncate(text, 600), {
      x: CONTENT_X, y: 2.30, w: opts.width, h: Math.min(estimateTextHeight(t, text, opts), 2.2),
      fontSize: opts.fontSize, color: t.textMain, fontFace: t.fontBody, lineSpacing: opts.lineSpacing,
    });
  }

  const ig = rd?.instagramAnalytics;
  const cards = [
    { label: 'THEIR AUDIENCE', value: ig?.followers ? `${ig.followers.toLocaleString()}` : '—', sub: `Followers on @${ig?.handle || ''}` },
    { label: 'OUR AUDIENCE', value: '2M+', sub: 'Across YouTube and Instagram' },
    { label: 'AGE OVERLAP', value: '76%', sub: 'Aged 18-34, business & finance focused' },
  ];
  const boxW = 3.87;
  const xs = [0.67, 4.73, 8.80];
  cards.forEach((c, i) => {
    slide.addShape(pptx.ShapeType.rect, {
      x: xs[i], y: 4.60, w: boxW, h: 1.85,
      fill: { color: t.lightBg }, line: { type: 'none' },
    });
    slide.addText(c.label, {
      x: xs[i] + 0.20, y: 4.78, w: boxW - 0.40, h: 0.30,
      fontSize: 11.5, bold: true, color: t.textMuted, fontFace: t.fontBody,
    });
    slide.addText(c.value, {
      x: xs[i] + 0.20, y: 5.08, w: boxW - 0.40, h: 0.62,
      fontSize: 30, bold: true, color: t.accent, fontFace: t.fontBody,
    });
    slide.addText(c.sub, {
      x: xs[i] + 0.20, y: 5.72, w: boxW - 0.40, h: 0.55,
      fontSize: 11.5, color: t.textMuted, fontFace: t.fontBody,
    });
  });

  addFooter(t, slide, pptx);
}

// ==========================================
// CREATOR CONTENT — existing videos/reels matched to the prospect's category.
// Proves "we already make content in your space" with clickable evidence.
// ==========================================
function addCreatorProofSlide(t, pptx, rd, brandName) {
  // A hand-added entry that was never filled in would render as an empty
  // card, so require a title before it reaches the slide.
  const matches = (rd?.creatorMatches || []).filter(m => m?.title?.trim()).slice(0, 3);
  if (!matches.length) return;

  const slide = pptx.addSlide();
  const hasBrandTier = matches.some(m => m.tier === 'brand');
  addSlideHeader(
    t, slide, pptx,
    hasBrandTier ? `We've Already Covered ${brandName}` : 'We Already Make Content in Your Space',
    'Existing episodes and reels from our channels'
  );

  const boxW = 3.87;
  const xs = [0.67, 4.73, 8.80];
  const top = 2.45;
  const cardH = 2.85;

  matches.forEach((m, i) => {
    const x = xs[i];
    const link = m.url ? { url: m.url } : undefined;

    // Same card shell as the brand-collab slide. No poster: the thumbnail used
    // to take 2.18in of this card, and reels never had a usable one anyway —
    // their CDN urls are signed and expire long before the deck is opened.
    slide.addShape(pptx.ShapeType.rect, {
      x, y: top, w: boxW, h: cardH,
      fill: { color: t.lightBg }, line: { type: 'none' }, hyperlink: link,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x, y: top, w: 0.08, h: cardH,
      fill: { color: t.brandColor },
    });

    const titleText = truncate(m.title || '', 110);
    const titleOpts = { fontSize: 14.5, width: boxW - 0.45, lineSpacing: 18 };
    slide.addText(titleText, {
      x: x + 0.26, y: top + 0.18, w: titleOpts.width,
      h: Math.min(estimateTextHeight(t, titleText, titleOpts), 1.10),
      fontSize: titleOpts.fontSize, bold: true, color: t.textMain,
      fontFace: t.fontBody, lineSpacing: titleOpts.lineSpacing,
      hyperlink: link,
    });

    // Why this video is relevant to the prospect — typed per report, and the
    // one line on this slide that is actually about them rather than about us.
    if (m.reason) {
      const opts = { fontSize: 11, width: boxW - 0.45, lineSpacing: 14 };
      slide.addText(truncate(m.reason, 130), {
        x: x + 0.26, y: top + 1.36, w: opts.width,
        h: Math.min(estimateTextHeight(t, m.reason, opts), 0.85),
        fontSize: opts.fontSize, color: t.textMuted,
        fontFace: t.fontBody, lineSpacing: opts.lineSpacing,
      });
    }

    addViewLink(t, slide, { x: x + 0.26, y: top + 2.36, w: boxW - 0.45, url: m.url });
  });

  addFooter(t, slide, pptx);
}

// ==========================================
// PROOF — past work with real results. Brand-independent: the content is
// fixed in OPEN_GREY_OFFER above rather than entered per report, since it's
// identical on every deck. Skips itself when that list is empty.
// ==========================================
function addProofSlide(t, pptx) {
  const entries = OPEN_GREY_OFFER.proof
    .filter(p => p.brand?.trim() && p.result?.trim())
    .slice(0, 3);
  if (!entries.length) return;

  const slide = pptx.addSlide();
  addSlideHeader(t, slide, pptx, 'Proof', "Brands we've done this for, and what happened");

  const rowH = 1.15;
  entries.forEach((entry, i) => {
    const y = 2.30 + i * (rowH + 0.18);
    slide.addShape(pptx.ShapeType.rect, {
      x: CONTENT_X, y, w: CONTENT_W, h: rowH,
      fill: { color: t.bg }, line: { color: t.border },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: CONTENT_X, y, w: 0.08, h: rowH,
      fill: { color: t.brandColor },
    });
    slide.addText(entry.brand, {
      x: CONTENT_X + 0.28, y: y + 0.16, w: 3.2, h: rowH - 0.32,
      fontSize: 17, bold: true, color: t.textMain, fontFace: t.fontBody, valign: 'middle',
    });
    slide.addText(entry.work || '', {
      x: CONTENT_X + 3.6, y: y + 0.16, w: 3.8, h: rowH - 0.32,
      fontSize: 12.5, color: t.textMuted, fontFace: t.fontBody, valign: 'middle',
    });
    slide.addText(entry.result, {
      x: CONTENT_X + 7.6, y: y + 0.16, w: CONTENT_W - 7.9, h: rowH - 0.32,
      fontSize: 15, bold: true, color: t.accent, fontFace: t.fontBody, valign: 'middle',
    });
  });

  const quote = OPEN_GREY_OFFER.testimonial?.quote?.trim();
  if (quote) {
    const quoteY = 2.30 + entries.length * (rowH + 0.18) + 0.30;
    slide.addShape(pptx.ShapeType.rect, {
      x: CONTENT_X, y: quoteY, w: 0.04, h: 0.95,
      fill: { color: t.brandColor },
    });
    slide.addText(`“${truncate(quote, 220)}”`, {
      x: CONTENT_X + 0.24, y: quoteY, w: CONTENT_W - 0.5, h: 0.60,
      fontSize: 14.5, italic: true, color: t.textMain, fontFace: t.fontBody,
    });
    if (OPEN_GREY_OFFER.testimonial.author?.trim()) {
      slide.addText(`— ${OPEN_GREY_OFFER.testimonial.author}`, {
        x: CONTENT_X + 0.24, y: quoteY + 0.60, w: CONTENT_W - 0.5, h: 0.32,
        fontSize: 12, color: t.textMuted, fontFace: t.fontBody,
      });
    }
  }

  addFooter(t, slide, pptx);
}

// ==========================================
// INVESTMENT — anchors the à-la-carte cost before revealing the real price,
// then removes the buyer's downside with a guarantee.
// ==========================================
function addInvestmentSlide(t, pptx) {
  const pricing = OPEN_GREY_OFFER.pricing;
  if (!pricing?.yourInvestment?.trim()) return;

  const slide = pptx.addSlide();
  addSlideHeader(t, slide, pptx, 'Investment', 'What this would cost you separately');

  const lines = (pricing.lineItems || []).filter(l => l.value?.trim());
  let y = 2.32;
  lines.forEach((l) => {
    slide.addText(l.label, {
      x: CONTENT_X, y, w: 7.2, h: 0.36,
      fontSize: 14, color: t.textMuted, fontFace: t.fontBody, valign: 'middle',
    });
    slide.addText(l.value, {
      x: 7.9, y, w: 2.4, h: 0.36,
      fontSize: 14, color: t.textMuted, fontFace: t.fontBody, align: 'right', valign: 'middle',
    });
    y += 0.40;
  });

  if (pricing.totalValue?.trim()) {
    slide.addShape(pptx.ShapeType.rect, { x: CONTENT_X, y: y + 0.06, w: 9.63, h: 0.01, fill: { color: t.border } });
    y += 0.18;
    slide.addText('Total value', {
      x: CONTENT_X, y, w: 7.2, h: 0.40,
      fontSize: 14.5, bold: true, color: t.textMain, fontFace: t.fontBody, valign: 'middle',
    });
    slide.addText(pricing.totalValue, {
      x: 7.9, y, w: 2.4, h: 0.40,
      fontSize: 14.5, bold: true, color: t.textMain, fontFace: t.fontBody, align: 'right', valign: 'middle',
    });
    y += 0.52;
  }

  // The price gets its own emphasised block so the eye lands here last.
  slide.addShape(pptx.ShapeType.rect, {
    x: CONTENT_X, y: y + 0.10, w: 9.63, h: 1.05,
    fill: { color: t.lightBg }, line: { type: 'none' },
  });
  slide.addText('YOUR INVESTMENT', {
    x: CONTENT_X + 0.28, y: y + 0.24, w: 4.5, h: 0.32,
    fontSize: 12.5, bold: true, color: t.textMuted, fontFace: t.fontBody,
  });
  slide.addText(pricing.yourInvestment, {
    x: CONTENT_X + 0.28, y: y + 0.54, w: 6.0, h: 0.52,
    fontSize: 30, bold: true, color: t.brandColor, fontFace: t.fontBody,
  });
  y += 1.30;

  if (pricing.riskReversal?.trim()) {
    const opts = { fontSize: 13.5, width: 9.63, lineSpacing: 18 };
    slide.addText(`Our guarantee: ${pricing.riskReversal}`, {
      x: CONTENT_X, y: y + 0.18, w: opts.width,
      h: Math.min(estimateTextHeight(t, pricing.riskReversal, opts) + 0.2, 1.0),
      fontSize: opts.fontSize, bold: true, color: t.textMain, fontFace: t.fontBody, lineSpacing: opts.lineSpacing,
    });
  }

  addFooter(t, slide, pptx);
}

// ==========================================
// NEXT STEP — one specific, small action. A deck that ends without this
// leaves an interested reader with nothing to actually do.
// ==========================================
function addNextStepSlide(t, pptx, rd, brandName) {
  const ns = rd?.nextStep;
  const hasContact = ns?.bookingLink?.trim() || ns?.email?.trim() || ns?.phone?.trim();
  if (!hasContact) return;

  const slide = pptx.addSlide();
  addSlideHeader(t, slide, pptx, 'Next Step', `Let's get ${brandName} on the show`);

  if (ns.headline?.trim()) {
    slide.addText(ns.headline, {
      x: CONTENT_X, y: 2.40, w: CONTENT_W, h: 0.65,
      fontSize: 22, bold: true, color: t.textMain, fontFace: t.fontBody,
    });
  }

  let y = 3.30;
  const contacts = [
    ns.bookingLink?.trim() && { icon: 'Book a call', value: ns.bookingLink, link: ns.bookingLink },
    ns.email?.trim() && { icon: 'Email', value: ns.email, link: `mailto:${ns.email}` },
    ns.phone?.trim() && { icon: 'Phone', value: ns.phone },
  ].filter(Boolean);

  contacts.forEach((c) => {
    slide.addText(c.icon, {
      x: CONTENT_X, y, w: 1.9, h: 0.42,
      fontSize: 12.5, bold: true, color: t.textMuted, fontFace: t.fontBody, valign: 'middle',
    });
    slide.addText(c.value, {
      x: CONTENT_X + 2.0, y, w: 9.0, h: 0.42,
      fontSize: 15, color: c.link ? t.accent : t.textMain, fontFace: t.fontBody,
      underline: !!c.link, hyperlink: c.link ? { url: c.link } : undefined, valign: 'middle',
    });
    y += 0.52;
  });

  if (ns.scarcity?.trim()) {
    slide.addShape(pptx.ShapeType.rect, {
      x: CONTENT_X, y: y + 0.30, w: 0.04, h: 0.50,
      fill: { color: t.brandColor },
    });
    slide.addText(ns.scarcity, {
      x: CONTENT_X + 0.24, y: y + 0.30, w: CONTENT_W - 0.5, h: 0.50,
      fontSize: 14, bold: true, color: t.textMain, fontFace: t.fontBody, valign: 'middle',
    });
  }

  addFooter(t, slide, pptx);
}

// ==========================================
// 6. WHY PARTNER WITH OPEN GREY MEDIA
// ==========================================
function addWhyPartnerSlide(t, pptx, brandName) {
  const slide = pptx.addSlide();
  addSlideHeader(t, slide, pptx, 'Why Partner With Open Grey Media', 'Every business has a lesson to teach and a story worth telling');

  let y = 1.94;
  OPEN_GREY_OFFER.whyPartner.forEach((point) => {
    const opts = { fontSize: 13, width: 11.47, lineSpacing: 22 };
    const text = `•  ${point}`;
    const h = estimateTextHeight(t, text, opts);
    slide.addText(text, {
      x: CONTENT_X, y, w: opts.width, h,
      fontSize: opts.fontSize, color: t.textMain, fontFace: t.fontBody, lineSpacing: opts.lineSpacing,
    });
    y += h + 0.12;
  });

  y = Math.max(y + 0.15, 4.44);
  slide.addShape(pptx.ShapeType.rect, {
    x: CONTENT_X, y, w: CONTENT_W, h: 0.02,
    fill: { color: t.accent },
  });
  y += 0.18;

  const askOpts = { fontSize: 14.3, width: 11.47, lineSpacing: 19 };
  const askText = `Our Ask: ${brandName}, be our guest — share your story with thousands ready to learn from your hustle.`;
  slide.addText(askText, {
    x: CONTENT_X, y, w: askOpts.width, h: estimateTextHeight(t, askText, askOpts),
    fontSize: askOpts.fontSize, bold: true, color: t.textMain, fontFace: t.fontBody, lineSpacing: askOpts.lineSpacing,
  });

  addFooter(t, slide, pptx);
}

// ==========================================
// PUBLIC API — builds the pitch deck client-side (pptxgenjs runs in the
// browser), returning a Blob that the report page downloads as a .pptx.
// ==========================================
// Optional slides (proof, investment, next step, creator content, brand
// collabs) skip themselves when their content is empty — a blank pricing slide
// is worse than no pricing slide — so the deck is between 7 and 12 slides
// depending on how much has been filled in.
// `styleKey` comes off the report (report.deckStyle), so the choice is stored
// with the report rather than passed in at the call site — reopening a report
// downloads the same look it had last time. An unknown or missing key falls
// back to "classic", which is what every report made before styles existed has.
export async function buildPitchDeckPptx(report, brandName) {
  const t = resolveStyle(report?.deckStyle);

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Open Grey Media';
  pptx.company = 'Open Grey Media';
  pptx.subject = `Podcast & Influencer Marketing Pitch — ${brandName}`;
  pptx.title = `${brandName} — Open Grey Media Pitch`;

  addCoverSlide(t, pptx, report, brandName);
  addInstagramSlide(t, pptx, report);          // their problem, now with benchmarks
  addOpportunitySlide(t, pptx);                // market context
  addReachAudienceSlide(t, pptx);              // our solution
  addCreatorAnalyticsSlide(t, pptx);           // the measured numbers behind it
  addBrandCollabsSlide(t, pptx, report);       // brands that already bought it
  if (report?.audienceFit) {
    addWhyThisFitsSlide(t, pptx, report, brandName);  // the bridge
  }
  addCreatorProofSlide(t, pptx, report, brandName);   // we already cover your space
  addWhatYouGetSlide(t, pptx);                 // the offer
  addProofSlide(t, pptx);                      // evidence (fixed content)
  addInvestmentSlide(t, pptx);       // price + risk reversal
  addWhyPartnerSlide(t, pptx, brandName);
  addNextStepSlide(t, pptx, report, brandName);   // the ask

  return pptx.write({ outputType: 'blob' });
}

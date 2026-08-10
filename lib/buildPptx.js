import PptxGenJS from 'pptxgenjs';

// ==========================================
// THEME — matches the reference deck's palette exactly (verified against the
// real Eleve Diamonds template: FFFFFF bg, 000000/222222 text, 555555 muted,
// CCCCCC dividers, F9F9F9 card bg, FF4D4D brand-red accent).
// ==========================================
const OG = {
  bg: 'FFFFFF',
  textMain: '000000',
  textMuted: '555555',
  accent: '222222',
  brandColor: 'FF4D4D',
  border: 'CCCCCC',
  lightBg: 'F9F9F9',
};

// Canvas is LAYOUT_WIDE (13.333in x 7.5in) — every position below is measured
// against that real canvas, not guessed/scaled from a smaller layout.
const PAGE_W = 13.333;
const CONTENT_X = 0.67;
const CONTENT_W = 12.0;

function hex(c) { return c.startsWith('#') ? c.slice(1) : c; }

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
function estimateTextHeight(text, { fontSize, width, lineSpacing }) {
  if (!text) return 0;
  const avgCharWidthPt = fontSize * 0.52;
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
function addSlideHeader(slide, pptx, title, subtitle, titleY = 0.69) {
  slide.background = { color: OG.bg };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: PAGE_W, h: 0.07,
    fill: { color: OG.accent },
  });

  if (title) {
    slide.addText(title, {
      x: CONTENT_X, y: titleY, w: CONTENT_W, h: 0.69,
      fontSize: 33, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue',
    });
  }
  if (subtitle) {
    slide.addText(subtitle, {
      x: CONTENT_X, y: titleY + 0.69, w: CONTENT_W, h: 0.41,
      fontSize: 16.5, color: OG.textMuted, fontFace: 'Helvetica Neue',
    });
  }

  slide.addShape(pptx.ShapeType.rect, {
    x: CONTENT_X, y: titleY + 1.24, w: CONTENT_W, h: 0.01,
    fill: { color: OG.border },
  });
}

function addFooter(slide, pptx) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 6.99, w: 12.0, h: 0.01,
    fill: { color: OG.border },
  });
  slide.addText('Private & Confidential | Prepared by Open Grey Media', {
    x: 0.5, y: 7.06, w: 12.0, h: 0.28,
    fontSize: 9.5, color: OG.textMuted, fontFace: 'Helvetica Neue', align: 'left',
  });
}

// ==========================================
// 1. COVER SLIDE
// ==========================================
function addCoverSlide(pptx, rd, brandName) {
  const slide = pptx.addSlide();
  slide.background = { color: OG.bg };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 2.5, w: 1, h: 0.05,
    fill: { color: OG.brandColor },
  });

  slide.addText(brandName.toUpperCase(), {
    x: 0.5, y: 2.7, w: 9.0, h: 1.0,
    fontSize: 44, bold: true, color: OG.textMain, fontFace: 'Calibri',
  });

  const tagline = rd?.about?.tagline || 'Podcast & Influencer Marketing Proposal';
  slide.addText(tagline, {
    x: 0.55, y: 3.77, w: 7.99, h: 0.79,
    fontSize: 18, color: OG.textMuted, fontFace: 'Calibri',
  });

  addFooter(slide, pptx);
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
function addBenchmarkBars(slide, pptx, { x, y, w, rows }) {
  const labelW = 1.85;
  const valueW = 0.75;
  const trackW = w - labelW - valueW - 0.2;
  const rowH = 0.30;
  const max = Math.max(...rows.map(r => r.value), 0.1);

  rows.forEach((row, i) => {
    const rowY = y + i * rowH;
    slide.addText(row.label, {
      x, y: rowY, w: labelW, h: rowH,
      fontSize: 10.5, color: OG.textMuted, fontFace: 'Helvetica Neue', valign: 'middle',
    });
    // Track behind the bar, so short bars still read as "out of" something.
    slide.addShape(pptx.ShapeType.rect, {
      x: x + labelW, y: rowY + 0.09, w: trackW, h: 0.13,
      fill: { color: 'EEEEEE' }, line: { type: 'none' },
    });
    const barW = Math.max((row.value / max) * trackW, 0.03);
    slide.addShape(pptx.ShapeType.rect, {
      x: x + labelW, y: rowY + 0.09, w: barW, h: 0.13,
      fill: { color: row.highlight ? OG.brandColor : 'BBBBBB' }, line: { type: 'none' },
    });
    slide.addText(`${row.value}%`, {
      x: x + labelW + trackW + 0.1, y: rowY, w: valueW, h: rowH,
      fontSize: 10.5, bold: !!row.highlight,
      color: row.highlight ? OG.brandColor : OG.textMuted,
      fontFace: 'Helvetica Neue', valign: 'middle',
    });
  });

  return y + rows.length * rowH;
}

// ==========================================
// 2. INSTAGRAM ANALYTICS (real, measured data)
// ==========================================
function addInstagramSlide(pptx, rd) {
  const slide = pptx.addSlide();
  const ig = rd?.instagramAnalytics;
  addSlideHeader(slide, pptx, 'Instagram Analytics', ig ? `@${ig.handle}` : 'Data unavailable');

  if (!ig) {
    slide.addText(rd?.instagramInsight || 'Instagram analytics could not be measured for this profile.', {
      x: CONTENT_X, y: 2.3, w: CONTENT_W, h: 1.5, fontSize: 13, color: OG.textMuted, fontFace: 'Helvetica Neue',
    });
    addFooter(slide, pptx);
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
      fill: { color: OG.brandColor },
    });
    slide.addText(m.label, {
      x: colXs[i] + 0.13, y: 2.20, w: 2.80, h: 0.41,
      fontSize: 12.4, color: OG.textMuted, fontFace: 'Helvetica Neue',
    });
    slide.addText(m.value, {
      x: colXs[i] + 0.13, y: 2.61, w: 2.80, h: 0.55,
      fontSize: 24.8, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue',
    });
  });

  slide.addText('CONTENT MIX', {
    x: CONTENT_X, y: 3.38, w: 5.33, h: 0.41,
    fontSize: 16.5, bold: true, color: OG.accent, fontFace: 'Helvetica Neue',
  });
  if (ig.contentMix?.length > 0) {
    slide.addChart(pptx.ChartType.pie, [{
      name: 'Content Mix',
      labels: ig.contentMix.map(c => c.type),
      values: ig.contentMix.map(c => c.percentage),
    }], {
      x: CONTENT_X, y: 3.70, w: 5.7, h: 1.70,
      chartColors: [hex(OG.accent), hex(OG.textMuted), hex(OG.brandColor), 'AAAAAA'],
      showLegend: true, legendPos: 'r', legendFontSize: 10, legendColor: OG.textMain,
      showPercent: true, dataLabelFontSize: 10, dataLabelColor: OG.bg,
    });
  } else {
    slide.addText('Not enough recent posts to break down content mix.', {
      x: CONTENT_X, y: 3.85, w: 5.7, h: 0.5, fontSize: 11, italic: true, color: OG.textMuted, fontFace: 'Helvetica Neue',
    });
  }

  // Engagement rate against tier benchmarks — turns a bare percentage into a
  // visible gap, which is the actual selling point of this slide.
  const bench = benchmarkFor(ig.followers);
  const brandEr = Number(ig.engagementRatePct) || 0;
  slide.addText('ENGAGEMENT VS. TYPICAL ACCOUNTS THIS SIZE', {
    x: CONTENT_X, y: 5.52, w: 5.7, h: 0.28,
    fontSize: 12.5, bold: true, color: OG.accent, fontFace: 'Helvetica Neue',
  });
  addBenchmarkBars(slide, pptx, {
    x: CONTENT_X, y: 5.85, w: 5.7,
    rows: [
      { label: `@${ig.handle}`, value: brandEr, highlight: true },
      { label: 'Typical account', value: bench.median },
      { label: 'Strong performers', value: bench.strong },
    ],
  });

  slide.addText('WHAT THIS MEANS', {
    x: 6.57, y: 3.52, w: 5.33, h: 0.28,
    fontSize: 16.5, bold: true, color: OG.accent, fontFace: 'Helvetica Neue',
  });
  const insight = truncate(rd?.instagramInsight, 700);
  if (insight) {
    const insightOpts = { fontSize: 13.8, width: 6.16, lineSpacing: 18 };
    slide.addText(insight, {
      x: 6.68, y: 3.88, w: insightOpts.width, h: Math.min(estimateTextHeight(insight, insightOpts), 3.0),
      fontSize: insightOpts.fontSize, color: OG.textMain, fontFace: 'Helvetica Neue', lineSpacing: insightOpts.lineSpacing,
    });
  }

  addFooter(slide, pptx);
}

// ==========================================
// 3. THE OPPORTUNITY (Open Grey Media offer — brand-independent)
// ==========================================
function addOpportunitySlide(pptx) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, pptx, 'The Opportunity', "India's podcast & short-form video audience is exploding");

  const items = OPEN_GREY_OFFER.opportunity;
  const boxW = 3.87;
  const xs = [0.67, 4.73, 8.80];
  items.forEach((item, i) => {
    const x = xs[i];
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 2.34, w: boxW, h: 2.61,
      fill: { color: OG.lightBg }, line: { type: 'none' },
    });
    slide.addText(item.value, {
      x: x + 0.20, y: 2.55, w: boxW - 0.40, h: 0.76,
      fontSize: 41, bold: true, color: OG.accent, fontFace: 'Helvetica Neue',
    });
    slide.addText(item.label, {
      x: x + 0.20, y: 3.37, w: boxW - 0.40, h: 0.76,
      fontSize: 15, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue',
    });
    slide.addText(item.sub, {
      x: x + 0.20, y: 4.06, w: boxW - 0.40, h: 0.76,
      fontSize: 12.4, color: OG.textMuted, fontFace: 'Helvetica Neue',
    });
  });

  addFooter(slide, pptx);
}

// ==========================================
// 4. OUR REACH & AUDIENCE (Open Grey Media offer)
// ==========================================
function addReachAudienceSlide(pptx) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, pptx, 'Our Reach & Audience', 'The distribution network behind every episode');

  const items = OPEN_GREY_OFFER.reach;
  const boxW = 2.80;
  const xs = [0.67, 3.67, 6.67, 9.67];
  items.forEach((item, i) => {
    const x = xs[i];
    slide.addShape(pptx.ShapeType.rect, {
      x, y: 2.34, w: boxW, h: 2.50,
      fill: { color: OG.lightBg }, line: { type: 'none' },
    });
    slide.addText(item.value, {
      x: x + 0.16, y: 2.61, w: boxW - 0.32, h: 0.69,
      fontSize: 33, bold: true, color: OG.accent, fontFace: 'Helvetica Neue',
    });
    slide.addText(item.label, {
      x: x + 0.16, y: 3.30, w: boxW - 0.32, h: 0.83,
      fontSize: 13.8, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue',
    });
    const subOpts = { fontSize: 11, width: boxW - 0.32, lineSpacing: 13 };
    slide.addText(item.sub, {
      x: x + 0.16, y: 4.13, w: subOpts.width, h: Math.min(estimateTextHeight(item.sub, subOpts), 0.9),
      fontSize: subOpts.fontSize, color: OG.textMuted, fontFace: 'Helvetica Neue', lineSpacing: subOpts.lineSpacing,
    });
  });

  addFooter(slide, pptx);
}

// ==========================================
// 5. WHAT YOUR BRAND GETS (Open Grey Media offer)
// ==========================================
function addWhatYouGetSlide(pptx) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, pptx, 'What Your Brand Gets', 'Every episode becomes a full-scale distribution campaign', 0.48);

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
      fill: { color: OG.bg }, line: { color: OG.border },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: 0.08, h: rowH,
      fill: { color: OG.brandColor },
    });
    slide.addText(item.title, {
      x: x + 0.27, y: y + 0.11, w: colW - 0.5, h: 0.34,
      fontSize: 16.5, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue',
    });
    const descOpts = { fontSize: 12.4, width: colW - 0.5, lineSpacing: 15 };
    slide.addText(item.description, {
      x: x + 0.27, y: y + 0.46, w: descOpts.width, h: Math.min(estimateTextHeight(item.description, descOpts), rowH - 0.5),
      fontSize: descOpts.fontSize, color: OG.textMuted, fontFace: 'Helvetica Neue', lineSpacing: descOpts.lineSpacing,
    });
  });

  addFooter(slide, pptx);
}

// ==========================================
// WHY THIS FITS — bridges "our audience" to "your customer". Without this
// the prospect has to connect those dots themselves, and most won't.
// ==========================================
function addWhyThisFitsSlide(pptx, rd, brandName) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, pptx, 'Why This Fits', `Where ${brandName} and our audience overlap`);

  const text = rd?.audienceFit;
  if (text) {
    const opts = { fontSize: 15, width: CONTENT_W, lineSpacing: 24 };
    slide.addText(truncate(text, 600), {
      x: CONTENT_X, y: 2.30, w: opts.width, h: Math.min(estimateTextHeight(text, opts), 2.2),
      fontSize: opts.fontSize, color: OG.textMain, fontFace: 'Helvetica Neue', lineSpacing: opts.lineSpacing,
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
      fill: { color: OG.lightBg }, line: { type: 'none' },
    });
    slide.addText(c.label, {
      x: xs[i] + 0.20, y: 4.78, w: boxW - 0.40, h: 0.30,
      fontSize: 11.5, bold: true, color: OG.textMuted, fontFace: 'Helvetica Neue',
    });
    slide.addText(c.value, {
      x: xs[i] + 0.20, y: 5.08, w: boxW - 0.40, h: 0.62,
      fontSize: 30, bold: true, color: OG.accent, fontFace: 'Helvetica Neue',
    });
    slide.addText(c.sub, {
      x: xs[i] + 0.20, y: 5.72, w: boxW - 0.40, h: 0.55,
      fontSize: 11.5, color: OG.textMuted, fontFace: 'Helvetica Neue',
    });
  });

  addFooter(slide, pptx);
}

// ==========================================
// CREATOR CONTENT — existing videos/reels matched to the prospect's category.
// Proves "we already make content in your space" with clickable evidence.
// ==========================================
function addCreatorProofSlide(pptx, rd, brandName) {
  // A hand-added entry that was never filled in would render as an empty
  // card, so require a title before it reaches the slide.
  const matches = (rd?.creatorMatches || []).filter(m => m?.title?.trim()).slice(0, 3);
  if (!matches.length) return;

  const slide = pptx.addSlide();
  const hasBrandTier = matches.some(m => m.tier === 'brand');
  addSlideHeader(
    slide, pptx,
    hasBrandTier ? `We've Already Covered ${brandName}` : 'We Already Make Content in Your Space',
    'Existing episodes and reels from our channels'
  );

  const boxW = 3.87;
  const xs = [0.67, 4.73, 8.80];
  const thumbH = boxW * 9 / 16;
  const top = 2.34;

  matches.forEach((m, i) => {
    const x = xs[i];
    const isYouTube = m.platform === 'youtube';

    if (isYouTube && m.thumbDataUrl) {
      // Declared w/h carries the SOURCE aspect (4:3 for hqdefault, which has
      // letterbox bars); the sizing box carries the TARGET 16:9, so `cover`
      // crops exactly the bars and nothing else.
      const srcW = m.thumbW || 480;
      const srcH = m.thumbH || 360;
      slide.addImage({
        data: m.thumbDataUrl,
        x, y: top, w: boxW, h: boxW * (srcH / srcW),
        sizing: { type: 'cover', w: boxW, h: thumbH },
        hyperlink: m.url ? { url: m.url } : undefined,
      });
    } else {
      // Drawn tile: reels have no usable stored image (their CDN URLs are
      // signed and expire), and a YouTube thumbnail can fail to fetch.
      slide.addShape(pptx.ShapeType.rect, {
        x, y: top, w: boxW, h: thumbH,
        fill: { color: OG.accent }, line: { type: 'none' },
        hyperlink: m.url ? { url: m.url } : undefined,
      });
      // Drawn play glyph rather than the ▶ character — Helvetica Neue may not
      // carry U+25B6 and PowerPoint would substitute a random font.
      slide.addShape(pptx.ShapeType.triangle, {
        x: x + boxW / 2 - 0.16, y: top + thumbH / 2 - 0.19, w: 0.32, h: 0.38,
        fill: { color: OG.bg }, line: { type: 'none' }, rotate: 90,
        hyperlink: m.url ? { url: m.url } : undefined,
      });
      if (!isYouTube && m.hashtags?.length) {
        slide.addText(m.hashtags.slice(0, 3).map(h => `#${h}`).join('  '), {
          x: x + 0.16, y: top + thumbH - 0.42, w: boxW - 0.32, h: 0.30,
          fontSize: 10, color: OG.brandColor, fontFace: 'Helvetica Neue',
        });
      }
    }

    // Platform + metric line
    const metric = isYouTube
      ? [m.views != null ? `${m.views.toLocaleString()} views` : null, m.durationLabel].filter(Boolean).join(' · ')
      // Instagram exposes no view count at all — never print "views" here.
      : [m.likes != null ? `${m.likes.toLocaleString()} likes` : null,
         m.comments != null ? `${m.comments.toLocaleString()} comments` : null].filter(Boolean).join(' · ');

    slide.addText(isYouTube ? 'YOUTUBE' : 'INSTAGRAM', {
      x, y: top + thumbH + 0.10, w: 1.6, h: 0.26,
      fontSize: 10, bold: true, color: OG.brandColor, fontFace: 'Helvetica Neue',
    });

    const titleText = truncate(m.title || '', 72);
    slide.addText(titleText, {
      x, y: top + thumbH + 0.38, w: boxW, h: 0.72,
      fontSize: 13.5, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue',
      lineSpacing: 16, hyperlink: m.url ? { url: m.url } : undefined,
    });

    if (m.reason) {
      const opts = { fontSize: 11, width: boxW, lineSpacing: 14 };
      slide.addText(truncate(m.reason, 130), {
        x, y: top + thumbH + 1.14, w: boxW,
        h: Math.min(estimateTextHeight(m.reason, opts), 0.85),
        fontSize: opts.fontSize, color: OG.textMuted, fontFace: 'Helvetica Neue', lineSpacing: opts.lineSpacing,
      });
    }

    if (metric) {
      slide.addText(metric, {
        x, y: top + thumbH + 2.05, w: boxW, h: 0.28,
        fontSize: 11, bold: true, color: OG.accent, fontFace: 'Helvetica Neue',
      });
    }
  });

  addFooter(slide, pptx);
}

// ==========================================
// PROOF — past work with real results. Brand-independent: the content is
// fixed in OPEN_GREY_OFFER above rather than entered per report, since it's
// identical on every deck. Skips itself when that list is empty.
// ==========================================
function addProofSlide(pptx) {
  const entries = OPEN_GREY_OFFER.proof
    .filter(p => p.brand?.trim() && p.result?.trim())
    .slice(0, 3);
  if (!entries.length) return;

  const slide = pptx.addSlide();
  addSlideHeader(slide, pptx, 'Proof', "Brands we've done this for, and what happened");

  const rowH = 1.15;
  entries.forEach((entry, i) => {
    const y = 2.30 + i * (rowH + 0.18);
    slide.addShape(pptx.ShapeType.rect, {
      x: CONTENT_X, y, w: CONTENT_W, h: rowH,
      fill: { color: OG.bg }, line: { color: OG.border },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: CONTENT_X, y, w: 0.08, h: rowH,
      fill: { color: OG.brandColor },
    });
    slide.addText(entry.brand, {
      x: CONTENT_X + 0.28, y: y + 0.16, w: 3.2, h: rowH - 0.32,
      fontSize: 17, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue', valign: 'middle',
    });
    slide.addText(entry.work || '', {
      x: CONTENT_X + 3.6, y: y + 0.16, w: 3.8, h: rowH - 0.32,
      fontSize: 12.5, color: OG.textMuted, fontFace: 'Helvetica Neue', valign: 'middle',
    });
    slide.addText(entry.result, {
      x: CONTENT_X + 7.6, y: y + 0.16, w: CONTENT_W - 7.9, h: rowH - 0.32,
      fontSize: 15, bold: true, color: OG.accent, fontFace: 'Helvetica Neue', valign: 'middle',
    });
  });

  const quote = OPEN_GREY_OFFER.testimonial?.quote?.trim();
  if (quote) {
    const quoteY = 2.30 + entries.length * (rowH + 0.18) + 0.30;
    slide.addShape(pptx.ShapeType.rect, {
      x: CONTENT_X, y: quoteY, w: 0.04, h: 0.95,
      fill: { color: OG.brandColor },
    });
    slide.addText(`“${truncate(quote, 220)}”`, {
      x: CONTENT_X + 0.24, y: quoteY, w: CONTENT_W - 0.5, h: 0.60,
      fontSize: 14.5, italic: true, color: OG.textMain, fontFace: 'Helvetica Neue',
    });
    if (OPEN_GREY_OFFER.testimonial.author?.trim()) {
      slide.addText(`— ${OPEN_GREY_OFFER.testimonial.author}`, {
        x: CONTENT_X + 0.24, y: quoteY + 0.60, w: CONTENT_W - 0.5, h: 0.32,
        fontSize: 12, color: OG.textMuted, fontFace: 'Helvetica Neue',
      });
    }
  }

  addFooter(slide, pptx);
}

// ==========================================
// INVESTMENT — anchors the à-la-carte cost before revealing the real price,
// then removes the buyer's downside with a guarantee.
// ==========================================
function addInvestmentSlide(pptx) {
  const pricing = OPEN_GREY_OFFER.pricing;
  if (!pricing?.yourInvestment?.trim()) return;

  const slide = pptx.addSlide();
  addSlideHeader(slide, pptx, 'Investment', 'What this would cost you separately');

  const lines = (pricing.lineItems || []).filter(l => l.value?.trim());
  let y = 2.32;
  lines.forEach((l) => {
    slide.addText(l.label, {
      x: CONTENT_X, y, w: 7.2, h: 0.36,
      fontSize: 14, color: OG.textMuted, fontFace: 'Helvetica Neue', valign: 'middle',
    });
    slide.addText(l.value, {
      x: 7.9, y, w: 2.4, h: 0.36,
      fontSize: 14, color: OG.textMuted, fontFace: 'Helvetica Neue', align: 'right', valign: 'middle',
    });
    y += 0.40;
  });

  if (pricing.totalValue?.trim()) {
    slide.addShape(pptx.ShapeType.rect, { x: CONTENT_X, y: y + 0.06, w: 9.63, h: 0.01, fill: { color: OG.border } });
    y += 0.18;
    slide.addText('Total value', {
      x: CONTENT_X, y, w: 7.2, h: 0.40,
      fontSize: 14.5, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue', valign: 'middle',
    });
    slide.addText(pricing.totalValue, {
      x: 7.9, y, w: 2.4, h: 0.40,
      fontSize: 14.5, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue', align: 'right', valign: 'middle',
    });
    y += 0.52;
  }

  // The price gets its own emphasised block so the eye lands here last.
  slide.addShape(pptx.ShapeType.rect, {
    x: CONTENT_X, y: y + 0.10, w: 9.63, h: 1.05,
    fill: { color: OG.lightBg }, line: { type: 'none' },
  });
  slide.addText('YOUR INVESTMENT', {
    x: CONTENT_X + 0.28, y: y + 0.24, w: 4.5, h: 0.32,
    fontSize: 12.5, bold: true, color: OG.textMuted, fontFace: 'Helvetica Neue',
  });
  slide.addText(pricing.yourInvestment, {
    x: CONTENT_X + 0.28, y: y + 0.54, w: 6.0, h: 0.52,
    fontSize: 30, bold: true, color: OG.brandColor, fontFace: 'Helvetica Neue',
  });
  y += 1.30;

  if (pricing.riskReversal?.trim()) {
    const opts = { fontSize: 13.5, width: 9.63, lineSpacing: 18 };
    slide.addText(`Our guarantee: ${pricing.riskReversal}`, {
      x: CONTENT_X, y: y + 0.18, w: opts.width,
      h: Math.min(estimateTextHeight(pricing.riskReversal, opts) + 0.2, 1.0),
      fontSize: opts.fontSize, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue', lineSpacing: opts.lineSpacing,
    });
  }

  addFooter(slide, pptx);
}

// ==========================================
// NEXT STEP — one specific, small action. A deck that ends without this
// leaves an interested reader with nothing to actually do.
// ==========================================
function addNextStepSlide(pptx, rd, brandName) {
  const ns = rd?.nextStep;
  const hasContact = ns?.bookingLink?.trim() || ns?.email?.trim() || ns?.phone?.trim();
  if (!hasContact) return;

  const slide = pptx.addSlide();
  addSlideHeader(slide, pptx, 'Next Step', `Let's get ${brandName} on the show`);

  if (ns.headline?.trim()) {
    slide.addText(ns.headline, {
      x: CONTENT_X, y: 2.40, w: CONTENT_W, h: 0.65,
      fontSize: 22, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue',
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
      fontSize: 12.5, bold: true, color: OG.textMuted, fontFace: 'Helvetica Neue', valign: 'middle',
    });
    slide.addText(c.value, {
      x: CONTENT_X + 2.0, y, w: 9.0, h: 0.42,
      fontSize: 15, color: c.link ? OG.accent : OG.textMain, fontFace: 'Helvetica Neue',
      underline: !!c.link, hyperlink: c.link ? { url: c.link } : undefined, valign: 'middle',
    });
    y += 0.52;
  });

  if (ns.scarcity?.trim()) {
    slide.addShape(pptx.ShapeType.rect, {
      x: CONTENT_X, y: y + 0.30, w: 0.04, h: 0.50,
      fill: { color: OG.brandColor },
    });
    slide.addText(ns.scarcity, {
      x: CONTENT_X + 0.24, y: y + 0.30, w: CONTENT_W - 0.5, h: 0.50,
      fontSize: 14, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue', valign: 'middle',
    });
  }

  addFooter(slide, pptx);
}

// ==========================================
// 6. WHY PARTNER WITH OPEN GREY MEDIA
// ==========================================
function addWhyPartnerSlide(pptx, brandName) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, pptx, 'Why Partner With Open Grey Media', 'Every business has a lesson to teach and a story worth telling');

  let y = 1.94;
  OPEN_GREY_OFFER.whyPartner.forEach((point) => {
    const opts = { fontSize: 13, width: 11.47, lineSpacing: 22 };
    const text = `•  ${point}`;
    const h = estimateTextHeight(text, opts);
    slide.addText(text, {
      x: CONTENT_X, y, w: opts.width, h,
      fontSize: opts.fontSize, color: OG.textMain, fontFace: 'Helvetica Neue', lineSpacing: opts.lineSpacing,
    });
    y += h + 0.12;
  });

  y = Math.max(y + 0.15, 4.44);
  slide.addShape(pptx.ShapeType.rect, {
    x: CONTENT_X, y, w: CONTENT_W, h: 0.02,
    fill: { color: OG.accent },
  });
  y += 0.18;

  const askOpts = { fontSize: 14.3, width: 11.47, lineSpacing: 19 };
  const askText = `Our Ask: ${brandName}, be our guest — share your story with thousands ready to learn from your hustle.`;
  slide.addText(askText, {
    x: CONTENT_X, y, w: askOpts.width, h: estimateTextHeight(askText, askOpts),
    fontSize: askOpts.fontSize, bold: true, color: OG.textMain, fontFace: 'Helvetica Neue', lineSpacing: askOpts.lineSpacing,
  });

  addFooter(slide, pptx);
}

// ==========================================
// PUBLIC API — builds the 6-slide pitch deck client-side (pptxgenjs runs in
// the browser), returning a Blob — used both for local download and for the
// Drive upload in lib/googleSlides.js so both paths generate from the exact
// same bytes.
// ==========================================
// Optional slides (proof, investment, next step, creator content) skip
// themselves when their content is empty — a blank pricing slide is worse
// than no pricing slide — so the deck is between 6 and 10 slides depending
// on how much has been filled in.
export async function buildPitchDeckPptx(report, brandName) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Open Grey Media';
  pptx.company = 'Open Grey Media';
  pptx.subject = `Podcast & Influencer Marketing Pitch — ${brandName}`;
  pptx.title = `${brandName} — Open Grey Media Pitch`;

  addCoverSlide(pptx, report, brandName);
  addInstagramSlide(pptx, report);          // their problem, now with benchmarks
  addOpportunitySlide(pptx);                // market context
  addReachAudienceSlide(pptx);              // our solution
  if (report?.audienceFit) {
    addWhyThisFitsSlide(pptx, report, brandName);  // the bridge
  }
  addCreatorProofSlide(pptx, report, brandName);   // we already cover your space
  addWhatYouGetSlide(pptx);                 // the offer
  addProofSlide(pptx);                      // evidence (fixed content)
  addInvestmentSlide(pptx);       // price + risk reversal
  addWhyPartnerSlide(pptx, brandName);
  addNextStepSlide(pptx, report, brandName);   // the ask

  return pptx.write({ outputType: 'blob' });
}

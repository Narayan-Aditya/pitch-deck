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
      x: CONTENT_X, y: 3.79, w: 5.7, h: 3.0,
      chartColors: [hex(OG.accent), hex(OG.textMuted), hex(OG.brandColor), 'AAAAAA'],
      showLegend: true, legendPos: 'r', legendFontSize: 10, legendColor: OG.textMain,
      showPercent: true, dataLabelFontSize: 10, dataLabelColor: OG.bg,
    });
  } else {
    slide.addText('Not enough recent posts to break down content mix.', {
      x: CONTENT_X, y: 3.85, w: 5.7, h: 0.5, fontSize: 11, italic: true, color: OG.textMuted, fontFace: 'Helvetica Neue',
    });
  }

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
export async function buildPitchDeckPptx(report, brandName) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Open Grey Media';
  pptx.company = 'Open Grey Media';
  pptx.subject = `Podcast & Influencer Marketing Pitch — ${brandName}`;
  pptx.title = `${brandName} — Open Grey Media Pitch`;

  addCoverSlide(pptx, report, brandName);
  addInstagramSlide(pptx, report);
  addOpportunitySlide(pptx);
  addReachAudienceSlide(pptx);
  addWhatYouGetSlide(pptx);
  addWhyPartnerSlide(pptx, brandName);

  return pptx.write({ outputType: 'blob' });
}

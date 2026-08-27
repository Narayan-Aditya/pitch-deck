// Design tokens for the brand pitch deck — the geometry and type scale read
// off the approved reference deck (demo_ppt/Beanly_x_OpenGreyMedia.pptx), with
// the colour supplied per build by deck/palettes.js.
//
// Nothing in this module names a colour. `makeTheme(palette)` folds a palette
// into the token set the slide builders consume, so re-skinning the whole deck
// is one argument change and no slide edit. Keep it that way: a literal hex in
// slides.js is the one thing that breaks palette rotation.


export { SAFETY, blockHeightIn, ellipsizeToWidth, fitFontSize, measureTextIn, wrapLineCount } from "./metrics.js";

// 10 x 5.625in. The reference deck reports 5.62 because Google Slides rounds
// its EMU on export; 5.625 is the exact 16:9 height and what PowerPoint uses.
export const STAGE_W = 10;
export const STAGE_H = 5.625;

// ---------------------------------------------------------------------------
// Faces. PowerPoint-safe only — a webfont here silently falls back on the
// client's machine and the deck arrives in Calibri everywhere.
// ---------------------------------------------------------------------------
export const CAMBRIA = "Cambria";
export const CALIBRI = "Calibri";

// ---------------------------------------------------------------------------
// Type scale, in points, measured off the reference deck.
// ---------------------------------------------------------------------------
export const TYPE = {
  coverTitle: { font: CAMBRIA, size: 40, bold: true },
  coverLockup: { font: CAMBRIA, size: 20, bold: true },
  coverSub: { font: CALIBRI, size: 15 },
  closerTitle: { font: CAMBRIA, size: 34, bold: true },

  kicker: { font: CALIBRI, size: 11, bold: true, charSpacing: 1 },
  h1: { font: CAMBRIA, size: 30, bold: true },
  subhead: { font: CALIBRI, size: 13 },

  statBig: { font: CAMBRIA, size: 34, bold: true },
  statMed: { font: CAMBRIA, size: 26, bold: true },
  statSmall: { font: CAMBRIA, size: 24, bold: true },
  statTiny: { font: CAMBRIA, size: 18, bold: true },
  statLabel: { font: CALIBRI, size: 9.5, bold: true, charSpacing: 0.4 },

  cardTitle: { font: CALIBRI, size: 12, bold: true },
  cardBody: { font: CALIBRI, size: 8.5 },
  body: { font: CALIBRI, size: 10.5 },
  panelKicker: { font: CALIBRI, size: 10, bold: true, charSpacing: 0.6 },
  caption: { font: CALIBRI, size: 8 },
  folio: { font: CALIBRI, size: 9 },
};

// ---------------------------------------------------------------------------
// Grid. The reference deck works off a 0.5in side margin and a 9.0in measure,
// with the header block at fixed heights on every body slide.
// ---------------------------------------------------------------------------
export const MARGIN = { left: 0.5, right: 0.5, top: 0.35, bottom: 0.3 };
export const CONTENT_W = STAGE_W - MARGIN.left - MARGIN.right; // 9.0
export const CONTENT_RIGHT = STAGE_W - MARGIN.right;

export const HEADER = {
  kickerY: 0.35,
  titleY: 0.65,
  subheadY: 1.2,
  /** First y a slide's own content may start at. */
  contentTop: 1.65,
};

export const FOLIO_Y = 5.32;
export const FOOTER_TEXT = "Private & Confidential  |  Prepared by Open Grey Media";

/** Even columns across the content measure, with `gap` between them. */
export function columns(count, gap = 0.15) {
  const w = (CONTENT_W - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: MARGIN.left + i * (w + gap),
    w,
  }));
}

// ---------------------------------------------------------------------------
// Colour maths — used to derive the handful of tints a palette doesn't name.
// ---------------------------------------------------------------------------
function toRgb(hex) {
  let h = String(hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
}

function toHex(rgb) {
  return (
    "#" +
    rgb
      .map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function mix(a, b, ratio) {
  const ra = toRgb(a);
  const rb = toRgb(b);
  return toHex(ra.map((c, i) => c * (1 - ratio) + rb[i] * ratio));
}

function luminance(hex) {
  return toRgb(hex)
    .map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((acc, v, i) => acc + [0.2126, 0.7152, 0.0722][i] * v, 0);
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** pptxgenjs colour options want bare hex, no leading "#". */
export function hx(hex) {
  return String(hex ?? "").replace(/^#/, "");
}

/**
 * Fold a palette into the full token set. Everything the slides ask for is
 * here; anything derived (hairlines, chart tints, the second chart series)
 * is computed from the palette rather than hardcoded, so it re-skins too.
 */
export function makeTheme(palette) {
  const p = palette;
  return {
    palette: p,

    deep: p.deep,
    paper: p.paper,
    card: p.card,
    panel: p.panel,
    accent: p.accent,
    gold: p.gold,
    ink: p.ink,
    muted: p.muted,
    onDeep: p.onDeep,

    // Derived tints.
    hairline: mix(p.ink, p.paper, 0.86),
    cardEdge: mix(p.ink, p.card, 0.9),
    // The comparison series on every benchmark chart: the same hue as the
    // accent bar it is measured against, dropped back so the accent reads as
    // the subject and this reads as the baseline.
    chartBase: mix(p.accent, p.paper, 0.72),
    chartInk: p.muted,
    // Text on `deep` that should recede (the cover's confidential line).
    onDeepMuted: mix(p.onDeep, p.deep, 0.45),
  };
}

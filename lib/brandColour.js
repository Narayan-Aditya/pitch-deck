// The prospect brand's own primary colour, read off their site.
//
// Browser-free, on purpose. The version of this that ran in the Python service
// headless-rendered the page and sampled computed CSS from ~60 elements. It was
// removed after being measured: against sarkar.store it sampled 14 unstyled <a>
// tags, decided the brand colour was #0000EE — the browser's default link blue
// — and themed a black-and-white luxury brand in indigo. The brand's real
// colour, 18,18,18, was sitting in a --color-button custom property in the
// static HTML the whole time.
//
// So both tiers here read what the scrape already has:
//   - cssVarObservations() — CSS custom properties, the strongest signal a
//     themed storefront gives away without executing anything.
//   - logoDominantColours() — sharp over the logo bitmap, the fallback. sharp
//     rasterises SVG, which the Pillow version could not: a Shopify store with
//     an .svg wordmark used to yield nothing at all here.
//
// Nothing in this file throws; a failure just means the deck falls further down
// its own theming ladder (see lib/deck/pickPalette.js).
import sharp from "sharp";

// ---------------------------------------------------------------------------
// Colour parsing / maths
// ---------------------------------------------------------------------------
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_RE = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/i;
// Shopify's Dawn family writes its palette as bare "18,18,18" triplets rather
// than hex or rgb(), which is the only reason this third form exists.
const TRIPLET_RE = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/;

/** [r, g, b, a] with r/g/b in 0-255 and a in 0-1, or null. */
export function parseColour(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();

  const rgb = RGB_RE.exec(v);
  if (rgb) {
    return [
      Math.trunc(Number(rgb[1])),
      Math.trunc(Number(rgb[2])),
      Math.trunc(Number(rgb[3])),
      rgb[4] === undefined ? 1 : Number(rgb[4]),
    ];
  }

  if (HEX_RE.test(v)) {
    let h = v.replace(/^#/, "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }

  const triplet = TRIPLET_RE.exec(v);
  if (triplet) return [Number(triplet[1]), Number(triplet[2]), Number(triplet[3]), 1];

  return null;
}

export function toHex([r, g, b]) {
  const hex = (c) => Math.round(c).toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** [hue 0-360, saturation 0-1, lightness 0-1]. */
export function rgbToHsl([r0, g0, b0]) {
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

export function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const lig = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] :
    hue < 120 ? [x, c, 0] :
    hue < 180 ? [0, c, x] :
    hue < 240 ? [0, x, c] :
    hue < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

export function relativeLuminance([r, g, b]) {
  const lin = (c0) => {
    const c = c0 / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function compositeOver(rgb, alpha, surface) {
  return rgb.map((c, i) => Math.round(alpha * c + (1 - alpha) * surface[i]));
}

export function isNeutral(h, s, l) {
  return s < 0.12 || l > 0.92 || l < 0.08;
}

/** Walks lightness toward readable instead of rejecting the colour outright, so
 * the brand's actual hue survives on the slide background. */
function clampForReadability(h, s, l0, mode, bg) {
  let l = l0;
  let rgb = hslToRgb(h, s, l);

  if (mode === "dark") {
    for (let i = 0; i < 20 && contrastRatio(rgb, bg) < 3.0; i++) {
      l = Math.min(1, l + 0.04);
      rgb = hslToRgb(h, s, l);
    }
    return rgb;
  }

  for (let i = 0; i < 20 && relativeLuminance(rgb) > 0.4; i++) {
    l = Math.max(0, l - 0.04);
    rgb = hslToRgb(h, s, l);
  }
  return rgb;
}

// ---------------------------------------------------------------------------
// Palette clustering
// ---------------------------------------------------------------------------
const SOURCE_WEIGHT = {
  button_bg: 5.0,
  css_var: 4.5,
  link: 3.0,
  footer_header: 2.5,
  heading: 2.0,
  logo: 2.0,
  theme_color: 1.5,
};

function scoreObservations(observations, surface) {
  const scored = [];
  for (const obs of observations) {
    const parsed = parseColour(obs.colour);
    if (!parsed) continue;
    let [r, g, b] = parsed;
    const a = parsed[3];
    if (a < 0.5) continue;
    if (a < 1) [r, g, b] = compositeOver([r, g, b], a, surface);
    const [h, s, l] = rgbToHsl([r, g, b]);
    if (isNeutral(h, s, l)) continue;
    scored.push({
      h, s, l,
      weight: (SOURCE_WEIGHT[obs.source] ?? 1.0) * (Number(obs.weight) || 1.0),
      source: obs.source,
    });
  }
  return scored;
}

function cluster(scored) {
  const sorted = [...scored].sort((a, b) => b.weight - a.weight);
  const clusters = [];

  for (const c of sorted) {
    let merged = false;
    for (const k of clusters) {
      const hueD = Math.min(Math.abs(c.h - k.h), 360 - Math.abs(c.h - k.h));
      const closeHue = hueD < 24 || k.s < 0.2 || c.s < 0.2;
      if (closeHue && Math.abs(c.l - k.l) < 0.2 && Math.abs(c.s - k.s) < 0.3) {
        const total = k.weight + c.weight;
        k.h = (k.h * k.weight + c.h * c.weight) / total;
        k.s = (k.s * k.weight + c.s * c.weight) / total;
        k.l = (k.l * k.weight + c.l * c.weight) / total;
        k.weight = total;
        merged = true;
        break;
      }
    }
    if (!merged) clusters.push({ ...c });
  }

  return clusters.sort((a, b) => b.weight - a.weight);
}

/** No distinguishable brand hue, but real button colours exist — adopt the
 * site's own near-black identity rather than inventing one or giving up. This
 * is the branch that keeps a deliberately black-and-white luxury brand off a
 * random ground. */
function monochromeFallback(observations, surface) {
  let best = null;
  for (const obs of observations) {
    if (obs.source !== "button_bg") continue;
    const parsed = parseColour(obs.colour);
    if (!parsed) continue;
    let [r, g, b] = parsed;
    const a = parsed[3];
    if (a < 0.5) continue;
    if (a < 1) [r, g, b] = compositeOver([r, g, b], a, surface);
    if (relativeLuminance([r, g, b]) > 0.85) continue; // near-white, not an accent
    const weight = Number(obs.weight) || 1.0;
    if (!best || weight > best.weight) best = { rgb: [r, g, b], weight };
  }

  if (!best) return null;
  const [h, s, l] = rgbToHsl(best.rgb);
  const secondaryL = l < 0.5 ? Math.min(1, l + 0.3) : Math.max(0, l - 0.3);
  return { primary: toHex(best.rgb), secondary: toHex(hslToRgb(h, s, secondaryL)) };
}

export function buildPalette(observations, surface, mode) {
  const clusters = cluster(scoreObservations(observations, surface));
  if (!clusters.length) return monochromeFallback(observations, surface);

  const primary = clusters[0];
  const secondary = clusters.slice(1).find(
    (c) =>
      Math.min(Math.abs(c.h - primary.h), 360 - Math.abs(c.h - primary.h)) > 30 ||
      Math.abs(c.l - primary.l) > 0.25
  );

  const bg = mode === "light" ? [255, 255, 255] : [14, 17, 22];
  const primaryRgb = clampForReadability(primary.h, primary.s, primary.l, mode, bg);

  let secondaryRgb;
  if (secondary) {
    secondaryRgb = hslToRgb(secondary.h, secondary.s, secondary.l);
  } else {
    // No distinguishable second cluster (common for single-colour brands) —
    // derive one deterministically so chart series 2 still works.
    const derivedL = primary.l > 0.4 ? primary.l - 0.25 : primary.l + 0.12;
    secondaryRgb = hslToRgb(primary.h, Math.max(0, primary.s - 0.2), Math.min(1, Math.max(0, derivedL)));
  }

  return { primary: toHex(primaryRgb), secondary: toHex(secondaryRgb) };
}

// ---------------------------------------------------------------------------
// Static CSS custom properties
// ---------------------------------------------------------------------------
const CSS_VAR_CANDIDATES = [
  "--primary", "--color-primary", "--primary-color", "--brand", "--brand-color", "--accent",
  "--color-accent", "--secondary", "--color-secondary", "--theme-color", "--bs-primary",
  "--color-button", "--color-link",
  "--color-base-accent-1", "--color-base-accent-2", "--color-base-background-1", "--color-base-text",
  "--wp--preset--color--primary", "--wp--preset--color--secondary",
  "--wp--preset--color--accent", "--wp--preset--color--contrast",
];

const CSS_VAR_RE = new RegExp(
  `(${CSS_VAR_CANDIDATES.map((n) => n.replace(/-/g, "\\-")).join("|")})\\s*:\\s*([^;}"']{3,40})`,
  "gi"
);

// A page can declare the same property a dozen times (theme default, section
// override, media query). Counting each hit would let repetition outvote a
// stronger source, so each distinct value is observed exactly once — the
// opposite of the headless sampler's failure, where 14 copies of the default
// link colour beat the brand's own.
const MAX_CSS_VAR_OBSERVATIONS = 8;

/** Which observation source a custom property counts as.
 *
 * Not cosmetic. `--color-button` genuinely is a button background, and
 * monochromeFallback() — the branch that keeps a black-and-white brand from
 * being handed an invented hue — only ever looks at `button_bg`. Filing every
 * property under `css_var` would send an achromatic brand straight to the
 * domain-hash fallback instead. */
function sourceForVar(name) {
  const lowered = name.toLowerCase();
  if (lowered.includes("button")) return "button_bg";
  if (lowered.includes("link")) return "link";
  return "css_var";
}

export function cssVarObservations(html) {
  if (!html) return [];
  const seen = new Set();
  const out = [];
  try {
    for (const match of html.matchAll(CSS_VAR_RE)) {
      const value = match[2].trim();
      if (!value || seen.has(value) || !parseColour(value)) continue;
      seen.add(value);
      out.push({ colour: value, source: sourceForVar(match[1]), weight: 1 });
      if (out.length >= MAX_CSS_VAR_OBSERVATIONS) break;
    }
  } catch {
    return out;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Logo bitmap
// ---------------------------------------------------------------------------
const LOGO_TIMEOUT_MS = 8000;

/** Up to two chromatic colours from the logo. Never throws. */
export async function logoDominantColours(logoUrl) {
  if (!logoUrl) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGO_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(logoUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    // Flattened onto white first: a transparent PNG or SVG would otherwise
    // average its alpha into the counts and read as a pale wash.
    const { data, info } = await sharp(bytes)
      .flatten({ background: "#ffffff" })
      .resize(64, 64, { fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Bucket to a 32-level cube. sharp has no octree quantiser, and an exact
    // histogram over a resized logo is mostly antialiasing noise; coarse
    // buckets collapse that back onto the handful of colours actually used.
    const counts = new Map();
    for (let i = 0; i < data.length; i += info.channels) {
      const key =
        ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const colours = [];
    for (const [key] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      const rgb = [((key >> 10) & 31) << 3, ((key >> 5) & 31) << 3, (key & 31) << 3];
      const [h, s, l] = rgbToHsl(rgb);
      if (isNeutral(h, s, l)) continue;
      colours.push(toHex(rgb));
      if (colours.length >= 2) break;
    }
    return colours.length ? colours : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
/** The deck's brand colour, from the static HTML plus the logo bitmap.
 *
 * Returns null when the page gives up no chromatic signal at all — a real
 * answer, and one pickPalette.js already handles by seeding off the domain.
 * Only `palette.primary` is read downstream; `source` is here so a surprising
 * deck colour can be traced back to what produced it. */
export async function extractVisualIdentity(html, themeColour, logoUrl) {
  try {
    const observations = cssVarObservations(html);

    if (themeColour && parseColour(themeColour)) {
      observations.push({ colour: themeColour, source: "theme_color", weight: 1 });
    }

    const logoColours = await logoDominantColours(logoUrl);
    for (const colour of logoColours || []) {
      observations.push({ colour, source: "logo", weight: 1 });
    }

    if (!observations.length) return null;

    // Nothing static tells us the rendered body background, and every deck
    // palette is built on a light ground anyway.
    const surface = [255, 255, 255];
    let palette = buildPalette(observations, surface, "light");
    if (!palette && logoColours?.length) {
      palette = { primary: logoColours[0], secondary: logoColours[1] || logoColours[0] };
    }
    if (!palette) return null;

    return {
      source: {
        css_vars: observations
          .filter((o) => o.source !== "logo")
          .map((o) => `${o.source}:${o.colour}`),
        logo_colors: logoColours || [],
      },
      palette,
    };
  } catch {
    return null;
  }
}

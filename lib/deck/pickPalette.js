// Which palette does this brand's deck get?
//
// The deck's ground colour is what a reader registers first, so the match is
// made on `deep` — the cover/closer background — against the brand's own
// primary colour, on hue. Matching on `accent` instead was tried and rejected:
// the accents all sit in a narrow warm band (terracotta through ochre), so a
// blue or purple brand would land on the same two palettes every time and the
// "different colours each deck" requirement quietly stops holding.
//
// Two cases fall outside a hue match:
//   - the brand is achromatic (a deliberately black/white/grey identity, which
//     is common and not a scrape failure) — hue carries no signal, so pick
//     deterministically from the low-saturation palettes instead
//   - nothing was scraped at all — pick deterministically from the whole set
//
// Both fall back to a hash of the brand's own name/domain rather than a random
// draw, so rebuilding the same prospect's deck twice produces the same deck.
// That matters more than novelty: a client who asks for "the deck you sent,
// with one number fixed" should not get a differently-coloured deck back.

import { PALETTES } from "./palettes.js";

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function toRgb(hex) {
  let h = String(hex).trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** [hue 0-360, saturation 0-1, lightness 0-1]. */
export function toHsl(hex) {
  const [r, g, b] = toRgb(hex).map((c) => c / 255);
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

/** Shortest distance between two hues on the colour wheel, 0-180. */
function hueGap(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** FNV-1a — small, stable, and not dependent on the JS engine's hashing. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// A brand colour below this saturation says nothing about which hue family the
// deck should live in.
const ACHROMATIC_S = 0.12;

// The same line, drawn through the palettes' own grounds, splits them into two
// non-overlapping pools: chromatic grounds compete on hue, near-neutral ones
// are reserved for brands that have no hue to match. Without the split a barely
// chromatic ground (Slate's #1C1F24 measures 0.13) can win a hue match outright
// and a deliberately blue brand lands on what reads as grey.
const NEUTRAL_GROUND_S = 0.2;

function seedFrom(brand) {
  return String(brand?.final_url || brand?.url || brand?.name || "open-grey-media").toLowerCase();
}

/**
 * @param {object} brand - the `GET /brand` response.
 * @returns {{palette: object, reason: string}} the chosen palette plus why it
 *   was chosen, so the deck page can show it and a person can override.
 */
export function pickPaletteInfo(brand) {
  const raw = brand?.visual_identity?.palette?.primary || brand?.theme_color;
  const seed = seedFrom(brand);

  if (!raw || !HEX_RE.test(String(raw).trim())) {
    const p = PALETTES[hash(seed) % PALETTES.length];
    return { palette: p, reason: "No brand colour found — assigned from the brand's domain." };
  }

  const [h, s] = toHsl(raw);

  if (s < ACHROMATIC_S) {
    // Keep an intentionally monochrome brand on a restrained ground rather
    // than dropping it onto, say, aubergine.
    const quiet = PALETTES.filter((p) => toHsl(p.deep)[1] < NEUTRAL_GROUND_S);
    const pool = quiet.length ? quiet : PALETTES;
    const p = pool[hash(seed) % pool.length];
    return { palette: p, reason: `Brand colour ${raw} is near-neutral — assigned a restrained ground.` };
  }

  let best = PALETTES[0];
  let bestGap = Infinity;
  for (const p of PALETTES) {
    const [ph, ps] = toHsl(p.deep);
    // A near-grey ground has no meaningful hue to compare, so it should not
    // win a hue match against a genuinely chromatic brand.
    if (ps < NEUTRAL_GROUND_S) continue;
    const gap = hueGap(h, ph);
    if (gap < bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  return { palette: best, reason: `Matched to the brand's ${raw} — closest ground is ${best.name}.` };
}

export function pickPalette(brand) {
  return pickPaletteInfo(brand).palette;
}

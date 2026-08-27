// Character-width metrics for the PowerPoint-safe faces the deck sets:
// Cambria and Calibri for the pitch deck, Georgia and Arial kept because the
// audit harness and any ad-hoc measuring still reach for them.
//
// Why this file exists: every "fit" decision in the deck — how many lines a
// headline wraps to, whether a ledger value collides with its label, whether
// a scraped video title overflows its caption box — used to be made with a
// single flat guess of 0.52em per character. That is fine for mixed-case
// Georgia and badly wrong everywhere else: a run of capitals with letter
// spacing ("WHY WE'RE WRITING TO BEWAKOOF") measures far wider than the flat
// average predicts, so a box sized from that average silently overflows — and
// PowerPoint does not clip text to its box, it draws the overflow straight
// over whatever sits underneath.
//
// The tables are the standard PostScript core-font advance widths (units per
// 1000 em) for Helvetica / Helvetica-Bold, which Arial matches by design, and
// Times-Roman / Times-Bold as the base for Georgia. Georgia is not Times — it
// carries a much larger x-height — so its lowercase is scaled up against the
// Times base while its capitals, which are close to Times', are left nearly
// alone (GEORGIA_SCALE below). Accuracy is roughly ±3% against real
// rendering, which is why every fit helper here also applies SAFETY.

const codes = (str) => str.split(" ").map(Number);

// ASCII 32..126, in units/1000 em.
const HELVETICA = codes(
  "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 " +
    "556 556 556 556 556 556 556 556 556 556 " +
    "278 278 584 584 584 556 1015 " +
    "667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 " +
    "278 278 278 469 556 333 " +
    "556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 " +
    "334 260 334 584"
);

const HELVETICA_BOLD = codes(
  "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 " +
    "556 556 556 556 556 556 556 556 556 556 " +
    "333 333 584 584 584 611 975 " +
    "722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 " +
    "333 278 333 584 556 333 " +
    "556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 " +
    "389 280 389 584"
);

const TIMES = codes(
  "250 333 408 500 500 833 778 180 333 333 500 564 250 333 250 278 " +
    "500 500 500 500 500 500 500 500 500 500 " +
    "278 278 564 564 564 444 921 " +
    "722 667 667 722 611 556 722 722 333 389 722 611 889 722 722 556 722 667 556 611 722 722 944 722 722 611 " +
    "333 278 333 469 500 333 " +
    "444 500 444 500 444 333 500 500 278 278 500 278 778 500 500 500 500 333 389 278 500 500 722 500 500 444 " +
    "480 200 480 541"
);

const TIMES_BOLD = codes(
  "250 333 555 500 500 1000 833 278 333 333 500 570 250 333 250 278 " +
    "500 500 500 500 500 500 500 500 500 500 " +
    "333 333 570 570 570 500 930 " +
    "722 667 722 722 667 611 778 778 389 500 778 667 944 722 778 611 778 722 556 667 722 722 1000 722 722 667 " +
    "333 278 333 581 500 333 " +
    "500 556 444 556 444 333 500 556 278 333 556 278 833 556 500 556 556 444 389 333 556 500 722 500 500 444 " +
    "394 220 394 520"
);

// Georgia against the Times base: capitals and figures land within a couple of
// percent, lowercase is much wider because of the x-height.
const GEORGIA_SCALE = { upper: 1.02, lower: 1.15, other: 1.06 };
const GEORGIA_BOLD_SCALE = { upper: 1.03, lower: 1.16, other: 1.07 };

// Cambria is also a large-x-height Times descendant, but a distinctly narrower
// one — it was cut for on-screen reading at small sizes, so its lowercase runs
// tighter than Georgia's while the capitals sit close to Times'.
const CAMBRIA_SCALE = { upper: 1.0, lower: 1.08, other: 1.03 };
const CAMBRIA_BOLD_SCALE = { upper: 1.02, lower: 1.1, other: 1.04 };

// Calibri is a humanist sans noticeably narrower than Helvetica/Arial across
// the board — the same string set in Calibri occupies roughly 8% less measure,
// which over a full caption line is most of a word.
const CALIBRI_SCALE = { upper: 0.93, lower: 0.92, other: 0.94 };
const CALIBRI_BOLD_SCALE = { upper: 0.95, lower: 0.94, other: 0.96 };

const FIRST_CODE = 32;
const DEFAULT_WIDTH = 500; // anything outside ASCII (curly quotes, dashes, ellipsis)

function scaleFor(ch, scale) {
  if (!scale) return 1;
  if (ch >= "a" && ch <= "z") return scale.lower;
  if (ch >= "A" && ch <= "Z") return scale.upper;
  return scale.other;
}

function faceTable(fontFace, bold) {
  const face = String(fontFace || "").toLowerCase();
  if (face.startsWith("georgia")) {
    return { table: bold ? TIMES_BOLD : TIMES, scale: bold ? GEORGIA_BOLD_SCALE : GEORGIA_SCALE };
  }
  if (face.startsWith("cambria")) {
    return { table: bold ? TIMES_BOLD : TIMES, scale: bold ? CAMBRIA_BOLD_SCALE : CAMBRIA_SCALE };
  }
  if (face.startsWith("calibri")) {
    return { table: bold ? HELVETICA_BOLD : HELVETICA, scale: bold ? CALIBRI_BOLD_SCALE : CALIBRI_SCALE };
  }
  return { table: bold ? HELVETICA_BOLD : HELVETICA, scale: null };
}

/** Advance width of one character, in em units (1 = the font size). */
function charEm(ch, table, scale) {
  const idx = ch.charCodeAt(0) - FIRST_CODE;
  const raw = idx >= 0 && idx < table.length ? table[idx] : DEFAULT_WIDTH;
  return (raw / 1000) * scaleFor(ch, scale);
}

const PT_TO_IN = 1 / 72;

/**
 * Rendered width of `str` set on one line, in inches.
 *
 * `charSpacing` is pptxgenjs's own option and is measured in points per
 * character — the kicker style adds 2pt to every character, which across a
 * 40-character kicker is more than half an inch of width that a plain
 * em-based estimate misses entirely.
 */
export function measureTextIn(str, { sizePt, fontFace, bold = false, charSpacing = 0 } = {}) {
  const s = String(str ?? "");
  if (!s) return 0;
  const { table, scale } = faceTable(fontFace, bold);
  let em = 0;
  for (const ch of s) em += charEm(ch, table, scale);
  return em * sizePt * PT_TO_IN + s.length * (charSpacing || 0) * PT_TO_IN;
}

/**
 * Greedy word wrap — what PowerPoint does inside a fixed-width text box.
 * Returns the number of lines. Explicit newlines are honoured; a single word
 * wider than the measure breaks across lines rather than counting as one.
 */
export function wrapLineCount(str, { widthIn, sizePt, fontFace, bold = false, charSpacing = 0 } = {}) {
  const s = String(str ?? "").trim();
  if (!s || !(widthIn > 0)) return 1;
  const opts = { sizePt, fontFace, bold, charSpacing };
  const spaceW = measureTextIn(" ", opts);
  let lines = 0;

  for (const para of s.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines += 1;
      continue;
    }
    lines += 1;
    let used = 0;
    for (const word of words) {
      const wordW = measureTextIn(word, opts);
      const needed = used > 0 ? spaceW + wordW : wordW;
      if (used > 0 && used + needed > widthIn) {
        lines += 1;
        used = wordW;
      } else {
        used += needed;
      }
      // A word wider than the whole measure keeps wrapping onto further lines
      // (a long URL, or an unbroken brand name).
      while (used > widthIn) {
        lines += 1;
        used -= widthIn;
      }
    }
  }
  return Math.max(1, lines);
}

/** Height of a wrapped block of `lines` lines, in inches. */
export function blockHeightIn(lines, sizePt, lineSpacingMultiple = 1.2) {
  return (lines * sizePt * lineSpacingMultiple) / 72;
}

// Every fit decision keeps this much slack, to absorb the tables' residual
// error rather than landing exactly on the box edge.
export const SAFETY = 1.03;

/**
 * Largest size from `sizePt` down to `minPt` at which `str` wraps inside
 * `widthIn` × `heightIn`. Returns `minPt` when nothing fits — callers that
 * cannot afford an overflow at the floor should ellipsise as well.
 */
export function fitFontSize(
  str,
  {
    widthIn,
    heightIn = Infinity,
    sizePt,
    minPt = 8,
    fontFace,
    bold = false,
    charSpacing = 0,
    lineSpacingMultiple = 1.2,
    maxLines = Infinity,
    stepPt = 0.5,
  }
) {
  for (let pt = sizePt; pt > minPt; pt -= stepPt) {
    const lines = wrapLineCount(str, { widthIn: widthIn / SAFETY, sizePt: pt, fontFace, bold, charSpacing });
    if (lines <= maxLines && blockHeightIn(lines, pt, lineSpacingMultiple) * SAFETY <= heightIn) return pt;
  }
  return minPt;
}

/**
 * Trim `str` to fit `widthIn` on one line, ellipsising whatever was dropped.
 * For scraped one-liners (video titles, ledger values) where shrinking the
 * type any further would break the type scale.
 */
export function ellipsizeToWidth(str, { widthIn, sizePt, fontFace, bold = false, charSpacing = 0 } = {}) {
  const s = String(str ?? "").trim();
  const opts = { sizePt, fontFace, bold, charSpacing };
  if (!s || measureTextIn(s, opts) * SAFETY <= widthIn) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureTextIn(s.slice(0, mid) + "…", opts) * SAFETY <= widthIn) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? "…" : s.slice(0, lo).trimEnd() + "…";
}

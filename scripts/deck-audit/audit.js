// Layout audit for the brand pitch deck PPTX export.
//
//   npm run audit:deck            build every fixture deck and check it
//   npm run audit:deck -- --list  print the case names and exit
//
// Builds the real deck (pitch/buildDeck.js) for a spread of brand and
// offer combinations, then reads the generated OOXML back and checks two
// things, both geometric — neither is a judgement about design:
//
//   1. no text run's rendered ink overlaps another text run or an image
//   2. every image is placed at its own aspect ratio (contain), or carries
//      exactly the crop that filling its box demands (cover)
//
// Exits non-zero if anything is found. The built decks are left in
// .deck-audit/ so a finding can be opened in PowerPoint and looked at.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import buildPitchDeck from "../../lib/deck/pitch/buildDeck.js";
import { CASES } from "./fixtures.js";
import { embeddedImageSize, inkRect, readSlides } from "./ooxml.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../.deck-audit");

// Glyphs never fill their line box — leading above and below means two blocks
// can share a little space without anything visibly colliding. Only an
// intersection deeper than this actually prints one thing over another.
const MIN_OVERLAP_IN = 0.035;

// The source ratio has to survive the trip to within this much. Anything
// looser is visible on a logo mark.
const MAX_RATIO_DRIFT = 0.02;

// srcRect is in 1/100000ths; 200 is 0.2% of the image, well inside rounding.
const MAX_CROP_DRIFT = 200;

function collide(a, b) {
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return dx > MIN_OVERLAP_IN && dy > MIN_OVERLAP_IN;
}

/**
 * Is this type drawn *across* the rule, rather than merely resting against it?
 *
 * MIN_OVERLAP_IN cannot be used here: a 0.75pt rule is 0.0104in thick in total,
 * so demanding 0.035in of intersection with one can never be satisfied — which
 * is exactly why the first version of this check silently passed the bug it was
 * written for. The test instead asks whether the rule's centre line falls inside
 * the text's ink, with a small margin. A block that ends where a rule begins
 * (every ledger row in the deck) fails it; a line printed over the folio rule
 * passes it.
 */
function crossesRule(ink, rule) {
  const vertical = rule.box.h > rule.box.w;
  const margin = 0.01;
  if (vertical) {
    const cx = rule.box.x + rule.box.w / 2;
    const along = Math.min(ink.y + ink.h, rule.box.y + rule.box.h) - Math.max(ink.y, rule.box.y);
    return along > MIN_OVERLAP_IN && cx > ink.x + margin && cx < ink.x + ink.w - margin;
  }
  const cy = rule.box.y + rule.box.h / 2;
  const along = Math.min(ink.x + ink.w, rule.box.x + rule.box.w) - Math.max(ink.x, rule.box.x);
  return along > MIN_OVERLAP_IN && cy > ink.y + margin && cy < ink.y + ink.h - margin;
}

function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const short = (s) => (s.length > 46 ? s.slice(0, 46) + "…" : s);
const fx = (n) => n.toFixed(2);

async function checkImages(slide, findings) {
  let checked = 0;
  for (const pic of slide.shapes.filter((s) => s.kind === "pic")) {
    const nat = await embeddedImageSize(slide.zip, slide.rels[pic.rId]);
    if (!nat || !nat.w || !nat.h) continue;
    checked += 1;
    const natRatio = nat.h / nat.w;
    const boxRatio = pic.box.h / pic.box.w;

    if (pic.crop) {
      // Cover: the crop must be exactly what turns the source ratio into the
      // box ratio. An all-zero crop here means the image was simply stretched.
      const boxBased = boxRatio > natRatio;
      const width = boxBased ? pic.box.h / natRatio : pic.box.w;
      const height = boxBased ? pic.box.h : pic.box.w * natRatio;
      const wantL = Math.round(1e5 * 0.5 * (1 - pic.box.w / width));
      const wantT = Math.round(1e5 * 0.5 * (1 - pic.box.h / height));
      if (Math.abs(pic.crop.l - wantL) > MAX_CROP_DRIFT || Math.abs(pic.crop.t - wantT) > MAX_CROP_DRIFT) {
        findings.push(
          `slide ${slide.number}: IMAGE CROP  ${nat.w}x${nat.h} in ${fx(pic.box.w)}x${fx(pic.box.h)}in — ` +
            `got l=${pic.crop.l} t=${pic.crop.t}, needs l=${wantL} t=${wantT}` +
            (pic.crop.l === 0 && pic.crop.t === 0 ? " (no crop at all: the image is being stretched)" : "")
        );
      }
    } else if (Math.abs(boxRatio - natRatio) / natRatio > MAX_RATIO_DRIFT) {
      findings.push(
        `slide ${slide.number}: IMAGE STRETCHED  ${nat.w}x${nat.h} (ratio ${natRatio.toFixed(3)}) placed at ` +
          `${fx(pic.box.w)}x${fx(pic.box.h)}in (ratio ${boxRatio.toFixed(3)})`
      );
    }
  }
  return checked;
}

function checkCollisions(slide, findings) {
  const texts = slide.shapes.filter((s) => s.kind === "text").map((s) => ({ ...s, ink: inkRect(s) }));
  const pics = slide.shapes.filter((s) => s.kind === "pic");
  const rules = slide.shapes.filter((s) => s.kind === "rule");
  const charts = slide.shapes.filter((s) => s.kind === "chart");

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (collide(texts[i].ink, texts[j].ink)) {
        findings.push(
          `slide ${slide.number}: TEXT/TEXT  "${short(texts[i].ink.text)}" over "${short(texts[j].ink.text)}" ` +
            `(${overlapArea(texts[i].ink, texts[j].ink).toFixed(3)} sq in)`
        );
      }
    }
    for (const pic of pics) {
      if (collide(texts[i].ink, pic.box)) {
        findings.push(`slide ${slide.number}: TEXT/IMAGE  "${short(texts[i].ink.text)}" over an image`);
      }
    }
    for (const rule of rules) {
      if (crossesRule(texts[i].ink, rule)) {
        findings.push(
          `slide ${slide.number}: TEXT/RULE   "${short(texts[i].ink.text)}" drawn across the rule at ` +
            `y=${rule.box.y.toFixed(2)}in`
        );
      }
    }
    // A chart paints its own opaque plot area, so any label caught inside one
    // is simply gone from the printed slide — and unlike a text/text collision
    // it leaves no visible trace to notice by eye.
    for (const chart of charts) {
      if (collide(texts[i].ink, chart.box)) {
        findings.push(
          `slide ${slide.number}: TEXT/CHART  "${short(texts[i].ink.text)}" inside the chart at ` +
            `${fx(chart.box.x)},${fx(chart.box.y)}in`
        );
      }
    }
  }

  // Two charts sharing space is the same failure without any text involved.
  for (let i = 0; i < charts.length; i++) {
    for (let j = i + 1; j < charts.length; j++) {
      if (collide(charts[i].box, charts[j].box)) {
        findings.push(
          `slide ${slide.number}: CHART/CHART overlapping frames ` +
            `(${overlapArea(charts[i].box, charts[j].box).toFixed(3)} sq in)`
        );
      }
    }
  }

  return texts.length;
}

async function auditCase(label, opts) {
  const file = path.join(OUT, `${label}.pptx`);
  await buildPitchDeck(opts).writeFile({ fileName: file });

  const findings = [];
  let images = 0;
  let texts = 0;
  for (const slide of await readSlides(file)) {
    images += await checkImages(slide, findings);
    texts += checkCollisions(slide, findings);
  }
  return { findings, images, texts, file };
}

if (process.argv.includes("--list")) {
  CASES.forEach(([label]) => console.log(label));
  process.exit(0);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let total = 0;
for (const [label, opts] of CASES) {
  const { findings, images, texts } = await auditCase(label, opts);
  total += findings.length;
  const status = findings.length ? `${findings.length} issue(s)` : "clean";
  console.log(`\n=== ${label}: ${status}  [${texts} text blocks, ${images} images]`);
  findings.forEach((f) => console.log("    " + f));
}

console.log(`\n${total === 0 ? "PASS" : "FAIL"} — ${total} issue(s) across ${CASES.length} decks.`);
console.log(`Decks written to ${OUT}`);
if (total > 0) {
  console.log(`Inspect one with: node scripts/deck-audit/dump-slide.js <case> <slide-number>`);
  process.exitCode = 1;
}

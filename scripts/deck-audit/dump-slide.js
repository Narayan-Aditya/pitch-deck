// Prints one slide of an audited deck as a list of boxes, which is how you
// find out what a reported collision actually is.
//
//   node scripts/deck-audit/dump-slide.js typical-both 9
//
// Run the audit first — it writes the decks this reads.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embeddedImageSize, inkRect, readSlides } from "./ooxml.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../.deck-audit");

const [label, slideArg] = process.argv.slice(2);
if (!label) {
  console.error("usage: node scripts/deck-audit/dump-slide.js <case> [slide-number]");
  console.error("cases: node scripts/deck-audit/audit.js --list");
  process.exit(2);
}

const file = path.join(OUT, `${label}.pptx`);
if (!fs.existsSync(file)) {
  console.error(`No deck at ${file} — run "npm run audit:deck" first.`);
  process.exit(2);
}

const wanted = slideArg ? Number(slideArg) : null;
const fx = (n) => n.toFixed(2).padStart(5);

for (const slide of await readSlides(file)) {
  if (wanted && slide.number !== wanted) continue;
  console.log(`\n--- slide ${slide.number} ---`);
  for (const shape of slide.shapes) {
    const b = shape.box;
    const where = `x=${fx(b.x)} y=${fx(b.y)} w=${fx(b.w)} h=${fx(b.h)}`;
    if (shape.kind === "pic") {
      const nat = await embeddedImageSize(slide.zip, slide.rels[shape.rId]);
      const crop = shape.crop ? `crop l=${shape.crop.l} t=${shape.crop.t}` : "no crop";
      console.log(`image  ${where}  source=${nat ? `${nat.w}x${nat.h}` : "?"}  ${crop}`);
    } else if (shape.kind === "rule") {
      console.log(`rule   ${where}`);
    } else if (shape.kind !== "text") {
      // Charts and plain shapes carry no runs; printing where they sit is the
      // whole of what this tool can say about them, and asking `inkRect` for
      // text they do not have used to throw halfway down a slide.
      console.log(`${shape.kind.padEnd(6)} ${where}`);
    } else {
      const ink = inkRect(shape);
      const size = Math.max(...shape.runs.map((r) => r.sizePt));
      console.log(
        `text   ${where}  ${String(size).padStart(4)}pt  ` +
          `ink=${fx(ink.y)}..${fx(ink.y + ink.h)} (${ink.lines} line${ink.lines === 1 ? "" : "s"})  ` +
          ink.text.slice(0, 60)
      );
    }
  }
}

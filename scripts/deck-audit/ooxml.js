// Reads a generated .pptx back as geometry.
//
// The audit deliberately inspects the shipped file rather than the builder's
// intent: the whole class of bug it exists to catch (text drawn outside the
// box it was given, an image stretched to a box that is not its shape) only
// becomes visible once pptxgenjs has turned the calls into OOXML.
import fs from "node:fs";
import JSZip from "jszip";
import { measureTextIn } from "../../lib/deck/pitch/metrics.js";

export const EMU = 914400;

// The deck's rules are 0.75pt (0.0104in); its thinnest real panel is the
// pull-quote's 0.035in accent bar. Anything at or under this is a rule.
const RULE_MAX_THICKNESS_IN = 0.05;

const attr = (xml, name) => {
  const m = xml.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
};

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** Every drawn shape on one slide, as boxes in inches. */
export function parseShapes(xml) {
  const shapes = [];
  const re = /<p:(sp|pic|graphicFrame)>([\s\S]*?)<\/p:\1>/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, kind, body] = m;
    const off = body.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
    const ext = body.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!off || !ext) continue;
    const box = { x: +off[1] / EMU, y: +off[2] / EMU, w: +ext[1] / EMU, h: +ext[2] / EMU };

    // A native chart. It carries no text runs this reader can measure —
    // PowerPoint lays its axis and data labels out at open time — so it is
    // recorded as one opaque box. That is enough for the check that matters:
    // a chart paints over whatever it overlaps, so nothing may sit inside it.
    if (kind === "graphicFrame") {
      shapes.push({ kind: "chart", box, name: attr(body, "name") || "chart" });
      continue;
    }

    if (kind === "pic") {
      const src = body.match(/<a:srcRect l="(-?\d+)" r="(-?\d+)" t="(-?\d+)" b="(-?\d+)"\/>/);
      shapes.push({
        kind: "pic",
        box,
        name: attr(body, "descr") || "image",
        rId: (body.match(/<a:blip r:embed="(rId\d+)"/) || [])[1],
        crop: src ? { l: +src[1], r: +src[2], t: +src[3], b: +src[4] } : null,
      });
      continue;
    }

    // Text runs in order, with the properties that decide their width.
    const runs = [];
    const runRe = /<a:r>\s*<a:rPr([^>]*)>([\s\S]*?)<\/a:rPr>\s*<a:t>([\s\S]*?)<\/a:t>/g;
    let r;
    while ((r = runRe.exec(body))) {
      const [, props, inner, raw] = r;
      runs.push({
        text: unescapeXml(raw),
        sizePt: +(attr(props, "sz") || 1800) / 100,
        bold: attr(props, "b") === "1",
        charSpacing: attr(props, "spc") ? +attr(props, "spc") / 100 : 0,
        fontFace: (inner.match(/<a:latin typeface="([^"]*)"/) || [])[1] || "Arial",
      });
    }

    if (!runs.length) {
      // A filled shape carrying no type. Most are backgrounds and panels, which
      // are *meant* to sit under things — but a hairline is a rule, and type
      // printed across a rule is the same defect as type printed across type.
      // (Missing this is how a line reading "Plus: a creator campaign layered on
      // top" shipped drawn through the folio rule.) Thickness is what separates
      // the two: rules are drawn at fractions of a point.
      if (body.includes("<a:solidFill>") && Math.min(box.w, box.h) <= RULE_MAX_THICKNESS_IN) {
        shapes.push({ kind: "rule", box });
      }
      continue;
    }

    const lnSpc = body.match(/<a:lnSpc><a:spcPct val="(\d+)"\/><\/a:lnSpc>/);
    shapes.push({
      kind: "text",
      box,
      runs,
      align: (body.match(/<a:pPr[^>]*algn="(\w+)"/) || [])[1] || "l",
      anchor: (body.match(/<a:bodyPr[^>]*anchor="(\w+)"/) || [])[1] || "t",
      lineSpacing: lnSpc ? +lnSpc[1] / 100000 : 1.2,
      breaks: (body.match(/<a:br\/>/g) || []).length,
    });
  }
  return shapes;
}

/**
 * Where the glyphs land, as opposed to where the box is. A box is only a
 * request: PowerPoint sets the type at the size it was given and lets it
 * overflow, so this re-measures the runs and returns the rectangle the ink
 * actually occupies.
 */
export function inkRect(shape) {
  const text = shape.runs.map((r) => r.text).join("");
  const totalW = shape.runs.reduce((sum, r) => sum + measureTextIn(r.text, r), 0);
  const maxSize = Math.max(...shape.runs.map((r) => r.sizePt));
  const paragraphs = shape.breaks + 1;
  const lines = Math.max(paragraphs, Math.ceil(totalW / Math.max(shape.box.w, 0.01)));
  const h = (lines * maxSize * shape.lineSpacing) / 72;
  const w = lines > 1 ? shape.box.w : Math.min(totalW, shape.box.w);

  let x = shape.box.x;
  if (shape.align === "r") x = shape.box.x + shape.box.w - w;
  else if (shape.align === "ctr") x = shape.box.x + (shape.box.w - w) / 2;

  let y = shape.box.y;
  if (shape.anchor === "ctr") y = shape.box.y + (shape.box.h - h) / 2;
  else if (shape.anchor === "b") y = shape.box.y + shape.box.h - h;

  return { x, y, w, h, text, lines };
}

/** Slide XML plus its relationships, in slide order. */
export async function readSlides(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);

  const slides = [];
  for (const name of names) {
    const number = +name.match(/\d+/)[0];
    const relsXml = await zip.file(`ppt/slides/_rels/slide${number}.xml.rels`).async("string");
    slides.push({
      number,
      shapes: parseShapes(await zip.file(name).async("string")),
      rels: Object.fromEntries(
        [...relsXml.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((r) => [r[1], r[2].replace("../", "ppt/")])
      ),
      zip,
    });
  }
  return slides;
}

/** Source pixel size of an embedded PNG or JPEG, or null. */
export async function embeddedImageSize(zip, target) {
  if (!target) return null;
  const buf = await zip.file(target)?.async("nodebuffer");
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      }
      if (len <= 0) return null;
      i += 2 + len;
    }
  }
  return null;
}

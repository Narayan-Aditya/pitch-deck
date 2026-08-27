// Draw primitives for the brand pitch deck. Nothing here knows about brand
// data — it only knows how to put ink on paper. Every colour arrives through
// the theme object `t` (see theme.js `makeTheme`); none is written literally.

import { CALIBRI, CAMBRIA, CONTENT_W, FOLIO_Y, FOOTER_TEXT, HEADER, MARGIN, TYPE, hx } from "./theme.js";
import { SAFETY, blockHeightIn, ellipsizeToWidth, fitFontSize, wrapLineCount } from "./metrics.js";

const PT_TO_IN = 1 / 72;

export function text(slide, content, opts) {
  slide.addText(content ?? "", { align: "left", valign: "top", margin: 0, wrap: true, ...opts });
}

/**
 * A string set to fit the box it is given.
 *
 * PowerPoint never clips an overflowing text box — it draws the extra lines
 * straight over whatever sits below, which is how scraped copy (a long brand
 * name, a founder list, a video title) ends up printed on top of the next
 * element. Anything whose length is not known at design time goes through
 * here rather than `text()`: the size steps down until the wrapped block fits
 * `h`, and if even the floor size overflows the line cap the string is
 * ellipsised instead of being allowed to spill.
 *
 * Returns the geometry actually used, so a caller stacking elements can place
 * the next one below the real bottom edge rather than a guessed one.
 */
export function fitText(slide, content, opts) {
  const {
    x,
    y,
    w,
    h,
    fontSize,
    minFontSize = Math.max(6.5, fontSize * 0.7),
    fontFace = CALIBRI,
    bold = false,
    charSpacing = 0,
    lineSpacingMultiple = 1.2,
    maxLines = Infinity,
    ellipsize = false,
    ...rest
  } = opts;

  const size = fitFontSize(content, {
    widthIn: w,
    heightIn: h ?? Infinity,
    sizePt: fontSize,
    minPt: minFontSize,
    fontFace,
    bold,
    charSpacing,
    lineSpacingMultiple,
    maxLines,
  });

  let str = String(content ?? "");
  if (ellipsize && maxLines === 1) {
    str = ellipsizeToWidth(str, { widthIn: w, sizePt: size, fontFace, bold, charSpacing });
  } else if (ellipsize && Number.isFinite(maxLines)) {
    // Multi-line ellipsis. `fitFontSize` stops at `minFontSize`, so a string
    // that still needs more lines than the cap at that size was previously
    // drawn in full and overflowed its box — the caller asked for a line cap
    // and got a font-size cap. Drop trailing words until the cap is real.
    const measure = { widthIn: w / SAFETY, sizePt: size, fontFace, bold, charSpacing };
    if (wrapLineCount(str, measure) > maxLines) {
      const words = str.split(/\s+/);
      while (words.length > 1 && wrapLineCount(words.join(" ") + "…", measure) > maxLines) {
        words.pop();
      }
      str = words.join(" ") + "…";
    }
  }

  const lines = wrapLineCount(str, { widthIn: w / SAFETY, sizePt: size, fontFace, bold, charSpacing });
  const usedH = blockHeightIn(lines, size, lineSpacingMultiple);

  text(slide, str, {
    x,
    y,
    w,
    h: Math.max(h ?? 0, usedH),
    fontSize: size,
    fontFace,
    bold,
    charSpacing: charSpacing || undefined,
    lineSpacingMultiple,
    ...rest,
  });

  return { size, lines, h: usedH, bottom: y + usedH };
}

// `line: { type: "none" }`, not `{ width: 0 }`. A zero-width line still emits a
// stroke element carrying pptxgenjs's default #333333 — an un-themed colour
// sitting in the file. Inert today, but it defeats any check that asks "does
// this deck contain only its own palette", and that check is what keeps a
// literal hex from creeping into a slide builder unnoticed.
export function rect(slide, opts) {
  slide.addShape("rect", { line: { type: "none" }, ...opts });
}

export function roundRect(slide, opts) {
  slide.addShape("roundRect", { line: { type: "none" }, rectRadius: 0.04, ...opts });
}

/** A filled hairline rule. Weight is in points. */
export function rule(slide, { x, y, w, weightPt = 3, color }) {
  rect(slide, { x, y, w, h: weightPt * PT_TO_IN, fill: { color: hx(color) } });
}

/**
 * A picture fitted inside a box at its own aspect ratio, centred on both axes.
 *
 * Contain, never cover. Every image this deck bundles is a screenshot or a
 * portrait whose subject runs to an edge — a cover crop takes the hook line off
 * the bottom of a reel thumbnail and the top of a head off a portrait. The box
 * is the grid slot; the picture keeps its own shape inside it, and `pad` is the
 * breathing room left between the two when the box is a drawn tile.
 *
 * `href` makes the picture itself the link — PowerPoint hyperlinks a whole
 * picture, so unlike `linkCard` there is no separate affordance to draw.
 *
 * Returns the rectangle actually drawn, which is smaller than the box on at
 * least one axis; a caller labelling the image should measure off that.
 */
export function imageFit(slide, { x, y, w, h, image, href, title, pad = 0 }) {
  const ratio = (image?.h || 1) / (image?.w || 1);
  const drawW = Math.min(w - pad * 2, (h - pad * 2) / ratio);
  const drawH = drawW * ratio;
  const at = { x: x + (w - drawW) / 2, y: y + (h - drawH) / 2, w: drawW, h: drawH };

  const opts = { data: image.dataUri, ...at };
  if (title) opts.altText = String(title);
  if (href) opts.hyperlink = { url: href, tooltip: String(title || "Open") };
  slide.addImage(opts);

  return at;
}

/** The white card every body slide stacks its content on. */
export function card(slide, t, { x, y, w, h }) {
  rect(slide, { x, y, w, h, fill: { color: hx(t.card) }, line: { width: 0.75, color: hx(t.cardEdge) } });
}

/** A filled circle carrying a numeral or glyph — the step markers and icons. */
export function chip(slide, t, { x, y, d, label, fill, color, fontSize }) {
  slide.addShape("ellipse", {
    x,
    y,
    w: d,
    h: d,
    fill: { color: hx(fill ?? t.accent) },
    line: { type: "none" },
  });
  text(slide, label, {
    x,
    y,
    w: d,
    h: d,
    align: "center",
    valign: "middle",
    fontFace: CALIBRI,
    fontSize: fontSize ?? d * 34,
    bold: true,
    color: hx(color ?? t.card),
  });
}

// ---------------------------------------------------------------------------
// Slide furniture
// ---------------------------------------------------------------------------

/**
 * The kicker / headline / subhead block every body slide opens with, at the
 * fixed heights the reference deck uses. Returns the y content may start at —
 * normally HEADER.contentTop, but pushed down if a long headline wrapped.
 */
export function slideHeader(slide, t, { kicker, title, subhead }) {
  // Ellipsised to one line rather than set plain: the kicker interpolates the
  // scraped brand name, and `GET /brand` regularly returns a whole page title
  // there. Wrapped to a second line it prints straight through the headline
  // below it — PowerPoint does not clip an overflowing box.
  fitText(slide, String(kicker || "").toUpperCase(), {
    x: MARGIN.left,
    y: HEADER.kickerY,
    w: CONTENT_W,
    h: 0.3,
    fontSize: TYPE.kicker.size,
    minFontSize: 9,
    fontFace: TYPE.kicker.font,
    bold: true,
    charSpacing: TYPE.kicker.charSpacing,
    maxLines: 1,
    ellipsize: true,
    lineSpacingMultiple: 1.0,
    color: hx(t.accent),
  });

  const head = fitText(slide, title, {
    x: MARGIN.left,
    y: HEADER.titleY,
    w: CONTENT_W,
    h: 0.55,
    fontSize: TYPE.h1.size,
    minFontSize: 20,
    fontFace: CAMBRIA,
    bold: true,
    maxLines: 1,
    lineSpacingMultiple: 1.0,
    color: hx(t.ink),
  });

  if (subhead) {
    fitText(slide, subhead, {
      x: MARGIN.left,
      y: HEADER.subheadY,
      w: CONTENT_W,
      h: 0.35,
      fontSize: TYPE.subhead.size,
      minFontSize: 10,
      fontFace: CALIBRI,
      maxLines: 1,
      ellipsize: true,
      color: hx(t.muted),
    });
  }

  return Math.max(HEADER.contentTop, head.bottom + 0.75);
}

/** The confidential line, on every slide including the two dark ones. */
export function footer(slide, t, { onDark = false } = {}) {
  text(slide, FOOTER_TEXT, {
    x: MARGIN.left,
    y: FOLIO_Y,
    w: 6,
    h: 0.25,
    fontFace: CALIBRI,
    fontSize: TYPE.folio.size,
    color: hx(onDark ? t.onDeepMuted : t.muted),
  });
}

/**
 * A stat card: big numeral, label under it, optional supporting line.
 *
 * `valueSize` is a ceiling, not a promise — a four-character value ("166.3M")
 * in the same box as a two-character one ("2M+") has to come down or it runs
 * past the card edge, and the reference deck's own cards are sized for the
 * short case.
 */
export function statCard(slide, t, { x, y, w, h, value, label, sub, valueSize = TYPE.statMed.size, valueColor }) {
  card(slide, t, { x, y, w, h });

  const padX = 0.15;
  const inner = w - padX * 2;
  let cursor = y + 0.14;

  const v = fitText(slide, value, {
    x: x + padX,
    y: cursor,
    w: inner,
    h: valueSize / 72 + 0.16,
    fontSize: valueSize,
    minFontSize: 13,
    fontFace: CAMBRIA,
    bold: true,
    maxLines: 1,
    lineSpacingMultiple: 1.0,
    color: hx(valueColor ?? t.accent),
  });
  cursor = v.bottom + 0.1;

  const l = fitText(slide, String(label || "").toUpperCase(), {
    x: x + padX,
    y: cursor,
    w: inner,
    h: 0.3,
    fontSize: TYPE.statLabel.size,
    minFontSize: 7,
    fontFace: CALIBRI,
    bold: true,
    charSpacing: TYPE.statLabel.charSpacing,
    maxLines: 2,
    lineSpacingMultiple: 1.15,
    color: hx(t.ink),
  });
  cursor = l.bottom + 0.08;

  if (sub) {
    const room = y + h - 0.12 - cursor;
    if (room > 0.14) {
      fitText(slide, sub, {
        x: x + padX,
        y: cursor,
        w: inner,
        h: room,
        fontSize: TYPE.caption.size + 1,
        minFontSize: 6.5,
        fontFace: CALIBRI,
        maxLines: 3,
        lineSpacingMultiple: 1.25,
        color: hx(t.muted),
      });
    }
  }
}

/** The dark full-width callout strip: gold kicker over light body copy. */
export function calloutStrip(slide, t, { x, y, w, h, kicker, body }) {
  rect(slide, { x, y, w, h, fill: { color: hx(t.panel) } });
  text(slide, String(kicker || "").toUpperCase(), {
    x: x + 0.25,
    y: y + 0.13,
    w: w - 0.5,
    h: 0.25,
    fontFace: CALIBRI,
    fontSize: TYPE.panelKicker.size,
    bold: true,
    charSpacing: TYPE.panelKicker.charSpacing,
    color: hx(t.gold),
  });
  fitText(slide, body, {
    x: x + 0.25,
    y: y + 0.38,
    w: w - 0.5,
    h: h - 0.5,
    fontSize: TYPE.body.size,
    minFontSize: 8,
    fontFace: CALIBRI,
    lineSpacingMultiple: 1.3,
    color: hx(t.onDeep),
  });
}

/**
 * A card carrying a title, an optional metric line, an optional description
 * and a "View" affordance.
 *
 * `href` is what makes the affordance real. The reference deck set the same
 * "View ↗" text with no hyperlink behind it on a slide whose subhead invited
 * the reader to "open any of them" — so a card without a target simply does
 * not draw the row. The link carries no `target`: PowerPoint opens external
 * hyperlinks in the reader's default browser, which is a new window from the
 * deck's point of view.
 *
 * `meta` is the engagement line ("412K views", "18.4K likes · 312 comments").
 * It sits between the title and the link because it is the number the reader
 * is scanning for, and it is set apart from the title rather than folded into
 * the description so it reads as data rather than prose.
 */
export function linkCard(slide, t, { x, y, w, h, title, meta, body, href, titleSize = TYPE.cardTitle.size }) {
  card(slide, t, { x, y, w, h });

  const padX = Math.min(0.15, w * 0.09);
  const inner = w - padX * 2;

  // The link and the metric anchor to the bottom of the card, and the title
  // takes whatever is left above them. Flowing the metric *after* the title
  // instead put it wherever the title happened to end, so a title that wrapped
  // to a third line pushed the metric straight through the link — which is
  // what the layout audit caught on a five-card row.
  const META_H = 0.17;
  const linkTop = href ? y + h - 0.28 : null;
  const bottomLimit = linkTop !== null ? linkTop - 0.04 : y + h - 0.1;
  const metaTop = meta ? bottomLimit - META_H : null;
  const contentBottom = metaTop !== null ? metaTop - 0.04 : bottomLimit;

  const titleTop = y + 0.1;
  const titleRoom = body ? 0.44 : Math.max(0.18, contentBottom - titleTop);

  const ttl = fitText(slide, title, {
    x: x + padX,
    y: titleTop,
    w: inner,
    h: titleRoom,
    fontSize: titleSize,
    minFontSize: 7.5,
    fontFace: CALIBRI,
    bold: true,
    // Two lines on a metric card: the metric and the link hold the bottom, and
    // three lines of 7.5pt on a 1.4in card is not a title anyone reads.
    maxLines: body ? 3 : 2,
    ellipsize: true,
    lineSpacingMultiple: 1.15,
    color: hx(t.panel),
  });

  const bodyTop = ttl.bottom + 0.06;
  if (body && contentBottom - bodyTop > 0.14) {
    fitText(slide, body, {
      x: x + padX,
      y: bodyTop,
      w: inner,
      h: contentBottom - bodyTop,
      fontSize: TYPE.cardBody.size,
      minFontSize: 6.5,
      fontFace: CALIBRI,
      maxLines: 4,
      lineSpacingMultiple: 1.25,
      color: hx(t.muted),
    });
  }

  if (meta) {
    fitText(slide, meta, {
      x: x + padX,
      y: metaTop,
      w: inner,
      h: META_H,
      fontSize: 8.5,
      minFontSize: 6.5,
      fontFace: CALIBRI,
      bold: true,
      maxLines: 1,
      ellipsize: true,
      lineSpacingMultiple: 1.0,
      color: hx(t.muted),
    });
  }

  if (href) {
    text(slide, "View ↗", {
      x: x + padX,
      y: linkTop,
      w: Math.min(1.0, inner),
      h: 0.2,
      fontFace: CALIBRI,
      fontSize: 8.5,
      bold: true,
      color: hx(t.accent),
      hyperlink: { url: href, tooltip: String(title || "Open") },
    });
  }
}

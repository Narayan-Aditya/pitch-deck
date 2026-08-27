// The deck's two chart shapes, as native PowerPoint charts.
//
// The reference deck embedded these as flat PNGs, which cost it three things
// worth having: the client could not edit a number without going back to us,
// the category axis printed "1 / 2 / 3" instead of naming what each bar was,
// and the baked-in data labels wrapped mid-number ("3.82" rendered as "3.8"
// over "2"). A native chart fixes all three — PowerPoint owns the label
// layout, so a label never wraps, and the categories carry their real names.
//
// Colour comes from the theme, so charts re-skin with the rest of the deck.

import { CALIBRI, hx } from "./theme.js";

/**
 * Reels-vs-photos split.
 *
 * `video` and `photo` are counts, not percentages — the chart shows the share
 * and the caller decides whether the underlying sample is worth showing at
 * all. Returns false without drawing if there is nothing real to plot, so a
 * caller can put something else in the space rather than a chart of zeroes.
 */
export function contentMixChart(slide, t, { x, y, w, h, video, photo }) {
  const v = Number(video) || 0;
  const p = Number(photo) || 0;
  if (v + p <= 0) return false;

  slide.addChart(
    "doughnut",
    [{ name: "Content mix", labels: ["Video / Reel", "Photo"], values: [v, p] }],
    {
      x,
      y,
      w,
      h,
      holeSize: 52,
      chartColors: [hx(t.accent), hx(t.chartBase)],
      dataBorder: { pct: 1, color: hx(t.card) },
      showLegend: true,
      legendPos: "b",
      legendFontFace: CALIBRI,
      legendFontSize: 8,
      legendColor: hx(t.muted),
      showValue: false,
      showPercent: true,
      dataLabelColor: hx(t.card),
      dataLabelFontFace: CALIBRI,
      dataLabelFontSize: 8,
      dataLabelFontBold: true,
      chartArea: { fill: { color: hx(t.paper) } },
      plotArea: { fill: { color: hx(t.paper) } },
    }
  );
  return true;
}

/**
 * Engagement against the accounts a reader would compare this one to.
 *
 * `rows` is [{ label, value, highlight }] in the order they should stack.
 * Exactly one row is normally `highlight: true` — the subject of the slide —
 * and it takes the accent while the comparison rows take the receded tint, so
 * the point of the chart reads before any number does.
 */
export function benchmarkChart(slide, t, { x, y, w, h, rows, suffix = "%" }) {
  const clean = (rows || []).filter((r) => r && Number.isFinite(Number(r.value)));
  if (!clean.length) return false;

  // Horizontal bars plot bottom-up, so the array is reversed to make the first
  // row read at the top — the order a person wrote them in.
  const ordered = [...clean].reverse();

  slide.addChart(
    "bar",
    [
      {
        name: "Engagement rate",
        labels: ordered.map((r) => r.label),
        values: ordered.map((r) => Number(r.value)),
      },
    ],
    {
      x,
      y,
      w,
      h,
      barDir: "bar",
      barGapWidthPct: 45,
      // Single series: pptxgenjs maps chartColors onto the data points, which
      // is what lets the subject's bar carry the accent on its own.
      chartColors: ordered.map((r) => hx(r.highlight ? t.accent : t.chartBase)),
      showLegend: false,
      showValue: true,
      dataLabelPosition: "outEnd",
      dataLabelFormatCode: `0.00"${suffix}"`,
      dataLabelColor: hx(t.ink),
      dataLabelFontFace: CALIBRI,
      dataLabelFontSize: 8.5,
      dataLabelFontBold: true,
      catAxisLabelFontFace: CALIBRI,
      catAxisLabelFontSize: 8.5,
      catAxisLabelColor: hx(t.chartInk),
      catAxisLineShow: false,
      catGridLine: { style: "none" },
      valAxisHidden: true,
      valGridLine: { style: "none" },
      valAxisLineShow: false,
      // Headroom so the outermost data label is not clipped by the plot edge.
      valAxisMaxVal: Math.max(...ordered.map((r) => Number(r.value))) * 1.35,
      chartArea: { fill: { color: hx(t.paper) } },
      plotArea: { fill: { color: hx(t.paper) } },
    }
  );
  return true;
}

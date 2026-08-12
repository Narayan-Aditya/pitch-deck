// The five looks a deck can be built in.
//
// A style is a palette, a pair of typefaces, and one structural knob (the
// header bar). Slide layout — every x/y/w/h in lib/buildPptx.js — is shared,
// because the positions were measured against a real reference deck and five
// independent sets of them would be five sets to keep from overlapping. What
// changes is everything you actually notice from across a room.
//
// Token meanings, so a new style can be added without reading buildPptx.js:
//   bg          slide background
//   textMain    body and headline text
//   textMuted   secondary text — subtitles, captions, labels
//   accent      structural ink: the header bar, section headings, big numbers
//   brandColor  the one saturated colour — rules, links, the highlighted bar
//   onAccent    text that sits ON an accent-coloured fill (pie chart labels)
//   border      hairlines and card outlines
//   lightBg     tinted card fill; must read as "slightly off the background"
//   trackBg     the empty part of a bar chart
//   barMuted    an unhighlighted bar
//   chartFourth the fourth pie slice, when there is one
//
// Fonts are named so PowerPoint finds them on both Windows and macOS. A font
// that resolves on neither gets silently substituted, which is how a deck ends
// up in Times New Roman on the client's laptop.
//
//   charWidth   average glyph width as a fraction of font size, used by
//               estimateTextHeight to guess where text wraps. Georgia is wider
//               than Helvetica; getting this wrong overflows a text box.

export const DEFAULT_STYLE = 'classic';

export const DECK_STYLES = {
  classic: {
    label: 'Classic',
    blurb: 'Black on white, red accent. The original.',
    bg: 'FFFFFF',
    textMain: '000000',
    textMuted: '555555',
    accent: '222222',
    brandColor: 'FF4D4D',
    onAccent: 'FFFFFF',
    border: 'CCCCCC',
    lightBg: 'F9F9F9',
    trackBg: 'EEEEEE',
    barMuted: 'BBBBBB',
    chartFourth: 'AAAAAA',
    fontDisplay: 'Calibri',
    fontBody: 'Helvetica Neue',
    charWidth: 0.52,
    headerBarH: 0.07,
  },

  midnight: {
    label: 'Midnight',
    blurb: 'Dark slides, warm amber. Reads as premium.',
    bg: '10131A',
    textMain: 'FFFFFF',
    textMuted: '9AA3B0',
    accent: 'E9ECF1',
    brandColor: 'F5B301',
    onAccent: '10131A',
    border: '2B313C',
    lightBg: '1A1F29',
    trackBg: '242A35',
    barMuted: '5A6472',
    chartFourth: '6E7A8A',
    fontDisplay: 'Trebuchet MS',
    fontBody: 'Segoe UI',
    charWidth: 0.51,
    headerBarH: 0.07,
  },

  editorial: {
    label: 'Editorial',
    blurb: 'Cream paper, serif type, terracotta. Print-magazine feel.',
    bg: 'FBF8F3',
    textMain: '1C1917',
    textMuted: '6B6259',
    accent: '2C2622',
    brandColor: 'A63D2F',
    onAccent: 'FBF8F3',
    border: 'D9D0C3',
    lightBg: 'F2EBE0',
    trackBg: 'E7DFD2',
    barMuted: 'B5A896',
    chartFourth: '9C8E7C',
    fontDisplay: 'Georgia',
    fontBody: 'Georgia',
    // Georgia sets noticeably wider than Helvetica at the same point size.
    charWidth: 0.56,
    headerBarH: 0,
  },

  bold: {
    label: 'Bold',
    blurb: 'Heavy black header, electric blue. Loud on a projector.',
    bg: 'FFFFFF',
    textMain: '0A0A0A',
    textMuted: '4A4A4A',
    accent: '0A0A0A',
    brandColor: '1D4ED8',
    onAccent: 'FFFFFF',
    border: 'D4D4D4',
    lightBg: 'EFF4FE',
    trackBg: 'E2E8F0',
    barMuted: '94A3B8',
    chartFourth: '64748B',
    fontDisplay: 'Trebuchet MS',
    fontBody: 'Tahoma',
    charWidth: 0.53,
    // A thick block instead of a hairline. Content starts at 0.69in, so there
    // is room for this without moving anything.
    headerBarH: 0.30,
  },

  minimal: {
    label: 'Minimal',
    blurb: 'Greyscale, no header bar, nothing shouting.',
    bg: 'FFFFFF',
    textMain: '111111',
    textMuted: '767676',
    accent: '111111',
    // Deliberately not a colour. The highlighted bar and the "View" links stay
    // legible against barMuted without introducing one.
    brandColor: '111111',
    onAccent: 'FFFFFF',
    border: 'E5E5E5',
    lightBg: 'FAFAFA',
    trackBg: 'F0F0F0',
    barMuted: 'C4C4C4',
    chartFourth: '9E9E9E',
    fontDisplay: 'Segoe UI',
    fontBody: 'Segoe UI',
    charWidth: 0.51,
    headerBarH: 0,
  },
};

export const STYLE_KEYS = Object.keys(DECK_STYLES);

export function resolveStyle(key) {
  return DECK_STYLES[key] || DECK_STYLES[DEFAULT_STYLE];
}

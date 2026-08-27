// Premium palette library for the brand pitch deck.
//
// The deck's colour usage is role-based, not palette-based: every slide asks
// for `deep`, `paper`, `card`, `panel`, `accent`, `gold`, `ink`, `muted` or
// `onDeep` and never names a colour directly. Swapping the palette therefore
// re-skins the whole deck without touching a single slide builder.
//
// Roles, as they read on the reference deck (Beanly x Open Grey Media):
//   deep    dark background — cover and closing slides
//   paper   body-slide background (warm off-white, never pure #FFF)
//   card    the raised card sitting on `paper`
//   panel   mid-dark callout strip on a body slide ("What this means")
//   accent  kickers, icon chips, "View" links — the loud one
//   gold    accents on dark grounds: cover rule, panel kickers
//   ink     headings and card titles on `paper`/`card`
//   muted   secondary/caption text on `paper`/`card`
//   onDeep  body text on `deep`/`panel`
//
// Every entry is contrast-checked by scripts/check-palettes.mjs — run it after
// editing. The thresholds encode which pairs actually meet on a slide; a new
// palette that fails is a bug, not a taste call.

export const PALETTES = [
  {
    id: "forest-gold",
    name: "Forest & Gold",
    deep: "#1B2E1F", paper: "#FBF8F3", card: "#FFFFFF", panel: "#26402B",
    accent: "#B85042", gold: "#D8994D", ink: "#2B2521", muted: "#6B6259", onDeep: "#EFE9DE",
  },
  {
    id: "midnight-brass",
    name: "Midnight & Brass",
    deep: "#0F1D2E", paper: "#F8F6F1", card: "#FFFFFF", panel: "#1B3149",
    accent: "#A8443C", gold: "#C79A4B", ink: "#1E242B", muted: "#61666D", onDeep: "#E9EDF2",
  },
  {
    id: "espresso-copper",
    name: "Espresso & Copper",
    deep: "#241A14", paper: "#FAF6F0", card: "#FFFFFF", panel: "#3A2A1F",
    accent: "#9E5433", gold: "#C8974E", ink: "#2A211B", muted: "#6C6157", onDeep: "#F0E7DB",
  },
  {
    id: "oxblood-cream",
    name: "Oxblood & Cream",
    deep: "#2A1416", paper: "#FAF6F3", card: "#FFFFFF", panel: "#42222A",
    accent: "#8C2F39", gold: "#BF954E", ink: "#261E1F", muted: "#6A5C5C", onDeep: "#F1E4E2",
  },
  {
    id: "deep-teal-amber",
    name: "Deep Teal & Amber",
    deep: "#0E2C2E", paper: "#F6F8F6", card: "#FFFFFF", panel: "#17444A",
    accent: "#A85526", gold: "#D4A042", ink: "#1C2523", muted: "#5E6866", onDeep: "#E4EFEC",
  },
  {
    id: "aubergine-champagne",
    name: "Aubergine & Champagne",
    deep: "#241826", paper: "#FAF6F5", card: "#FFFFFF", panel: "#3B2842",
    accent: "#8A3F5C", gold: "#C3A054", ink: "#26202A", muted: "#675E6B", onDeep: "#EFE4EE",
  },
  {
    id: "slate-rose",
    name: "Slate & Rose Gold",
    deep: "#1C1F24", paper: "#F8F6F5", card: "#FFFFFF", panel: "#2E3440",
    accent: "#A05C4C", gold: "#C5937B", ink: "#22262B", muted: "#63676D", onDeep: "#E9E7E4",
  },
  {
    id: "olive-ochre",
    name: "Olive & Ochre",
    deep: "#23261A", paper: "#FAF8F1", card: "#FFFFFF", panel: "#373C26",
    accent: "#96562B", gold: "#C69D3B", ink: "#262619", muted: "#65634F", onDeep: "#EDEBDC",
  },
  {
    id: "graphite-sage",
    name: "Graphite & Sage",
    deep: "#191C1A", paper: "#F6F7F4", card: "#FFFFFF", panel: "#2C3830",
    accent: "#4F7050", gold: "#B49A62", ink: "#1F2320", muted: "#5F655F", onDeep: "#E7EBE5",
  },
  {
    id: "indigo-terracotta",
    name: "Indigo & Terracotta",
    deep: "#161A33", paper: "#F9F7F4", card: "#FFFFFF", panel: "#242B52",
    accent: "#AF5238", gold: "#C69A5E", ink: "#1F2230", muted: "#5F6371", onDeep: "#E8E9F2",
  },
  {
    id: "cocoa-sand",
    name: "Cocoa & Sand",
    deep: "#2B211B", paper: "#FBF7F1", card: "#FFFFFF", panel: "#42342A",
    accent: "#8F5A3C", gold: "#C6A268", ink: "#2A231D", muted: "#6B6055", onDeep: "#F1E8DC",
  },
  {
    id: "ink-marine",
    name: "Ink & Marine",
    deep: "#101B22", paper: "#F5F8F9", card: "#FFFFFF", panel: "#1B3038",
    accent: "#1F6473", gold: "#C0964C", ink: "#1A2126", muted: "#5B646A", onDeep: "#E3EDF0",
  },
];

/** Look one up by id; unknown ids fall back to the reference palette. */
export function paletteById(id) {
  return PALETTES.find((p) => p.id === id) || PALETTES[0];
}

// The creator spotlight slide's content — the four things a founder-led case
// study does, and the four reels that prove it.
//
// Hand-edited on purpose. The thumbnails themselves are generated into
// assets/caseStudy.js by assets/page_image/build_asset.py; the links live here
// so re-running that helper never wipes a URL. `id` is the join between the
// two files — an id with no thumbnail behind it is simply not drawn.
//
// `href` is what makes a thumbnail worth printing: the slide's whole claim is
// that this work is public and checkable, and a tile that doesn't open is a
// screenshot of a claim rather than the claim itself.

export const CASE_STUDY_BENEFITS = [
  "Trust Building",
  "Category Awareness",
  "Brand Hype Creation",
  "Higher Recall & Intent",
];

export const CASE_STUDY_CLIPS = [
  { id: "arata", title: "Arata — hair growth serum", href: "https://www.instagram.com/p/Dbn51jOzK8i/" },
  { id: "kids-shoes", title: "The ₹200 crore kids' shoe business", href: "https://www.instagram.com/p/DcBks5xTJeQ/" },
  { id: "beco", title: "Beco — boring business, crazy growth", href: "https://www.instagram.com/p/DcGnKTMTqTT/" },
  { id: "shiprocket", title: "Shiprocket — is the IPO worth it?", href: "https://www.instagram.com/p/Db5yYS_TgoH/" },
];

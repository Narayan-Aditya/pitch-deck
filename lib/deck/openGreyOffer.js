// Ported verbatim from the old brand-report-generator project's
// lib/buildPptx.js OPEN_GREY_OFFER — brand-independent facts about what Open
// Grey Media provides. Edit here, not per-report.
//
// Three variants exist because the wording (not just the stats) differs by
// what's being pitched: a podcast feature, an influencer/creator campaign,
// or both. `reach`/`influencerTiers` are null when that slide shouldn't be
// shown for a given variant — see pitch/slides.js.
const PODCAST_OPPORTUNITY = {
  subtitle: "India's podcast & short-form video audience is exploding",
  items: [
    { value: "500M+", label: "Active Indian Social Media Users", sub: "Fastest growing digital audience globally" },
    { value: "40%", label: "Annual Podcast Growth in India", sub: "Outpacing the global average of 15%" },
    { value: "85%", label: "Content Consumed via Short-Form Video", sub: "Reels & Shorts dominate discovery" },
  ],
};

const PODCAST_REACH = {
  title: "Our Reach & Audience",
  subtitle: "The distribution network behind every episode",
  items: [
    { value: "2M+", label: "Followers", sub: "Across YouTube and Instagram combined" },
    { value: "20M+", label: "Monthly Views", sub: "On long-form episodes, shorts, and reels" },
    { value: "2M+", label: "Total Interactions", sub: "Likes, comments, shares, and saves" },
    { value: "76%", label: "Audience Aged 18-34", sub: "Focused on Business, Finance & Startups" },
  ],
};

const PODCAST_WHAT_YOU_GET = {
  subtitle: "Every episode becomes a full-scale distribution campaign",
  items: [
    { title: "Full Episode Exposure", description: "Your brand featured in the complete podcast video on our main YouTube channel." },
    { title: "20 Instagram Reels", description: "Short-form reels crafted from your episode, maximizing algorithmic reach." },
    { title: "10-20 YouTube Shorts", description: "Bite-sized highlights driving discovery and subscriptions." },
    { title: "Premium Story Feature", description: "Your best clip featured as a Story on our main Instagram profile." },
    { title: "Facebook Distribution", description: "1 podcast episode + 12 Reels shared to our Facebook audience." },
    { title: "All-Platform Dominance", description: "From long-form YouTube to short reels — everywhere at once." },
  ],
};

const PODCAST_WHY_PARTNER = {
  items: [
    "Share your journey, challenges, and success stories with a motivated entrepreneurial audience",
    "Position yourself as a thought leader in your industry",
    "Build brand visibility across multiple platforms with professionally curated content",
    "Network with other business leaders and create collaborations beyond the podcast",
  ],
  ask: (brandName) => `${brandName}, share your story with thousands ready to learn from your hustle.`,
};

const INFLUENCER_TIERS = {
  title: "Influencer Marketing, Built Around Your Budget",
  subtitle: "Matching creators to your brand across the full spectrum",
  items: [
    { title: "Nano", sub: "1K - 20K followers", description: "Hyper-engaged, niche audiences. Authentic, low-cost storytelling at high volume." },
    { title: "Micro", sub: "20K - 200K followers", description: "Strong trust & engagement. Ideal for category-specific reach and credibility." },
    { title: "Mega", sub: "1M+ followers", description: "Mass visibility & brand recall. Best for launches and top-of-funnel awareness." },
    { title: "20,000+ Vetted Creators", sub: "", description: "Across categories — lifestyle, fitness, beauty, business & more." },
    { title: "Nano to Mega", sub: "Full-Spectrum Mix", description: "Every tier planned and blended to match campaign goals." },
    { title: "Budget-First", sub: "Custom Mapping", description: "Creator mix curated to your brand's budget & target reach." },
  ],
};

/**
 * The two things Open Grey Media sells, and the two slides that argue for them:
 * the influencer tiers slide belongs to IM, the preparation & amplification
 * slide to Podcast. A deck that doesn't pitch one has no business carrying its
 * slide — a podcast-only prospect used to be sent a creator-tier price ladder
 * for a service nobody had offered them.
 *
 * The selection is one, both, or neither. It folds back into the single
 * `offerType` string the rest of the deck already reads, so the copy variants
 * below, `contentLimitsFor` and the three offer-aware slides keep working off
 * one value rather than having to learn a second representation.
 */
export const OFFER_KINDS = [
  { key: "marketing", label: "IM", full: "Influencer Marketing" },
  { key: "podcast", label: "Podcast", full: "Podcast" },
];

/**
 * A selection of `OFFER_KINDS` keys as an offer type.
 *
 * Four states, not three: turning both off is a choice a person can make, and
 * it means a deck of the shared slides with neither offer argued for. It is not
 * the same as "IM alone", which is what an earlier version quietly returned.
 */
export function offerTypeFor(kinds) {
  const marketing = kinds.includes("marketing");
  const podcast = kinds.includes("podcast");
  if (marketing && podcast) return "both";
  if (podcast) return "podcast";
  if (marketing) return "marketing";
  return "none";
}

/** Whether `offerType` includes one kind — which is what gates its slide. */
export function offerIncludes(offerType, kind) {
  return offerType === "both" || offerType === kind;
}

/** How many of the two offer slides `offerType` prints. */
export function offerSlideCount(offerType) {
  return OFFER_KINDS.filter((k) => offerIncludes(offerType, k.key)).length;
}

export const OFFER_VARIANTS = {
  podcast: {
    label: "Podcast",
    opportunity: PODCAST_OPPORTUNITY,
    reach: PODCAST_REACH,
    influencerTiers: null,
    whatYouGet: PODCAST_WHAT_YOU_GET,
    whyPartner: PODCAST_WHY_PARTNER,
  },
  marketing: {
    label: "Marketing & Influencer",
    opportunity: {
      subtitle: "India's creator economy is exploding",
      items: [
        { value: "500M+", label: "Active Indian Social Media Users", sub: "Fastest growing digital audience globally" },
        { value: "20,000+", label: "Vetted Creator Network", sub: "Across every category and audience segment" },
        { value: "85%", label: "Content Consumed via Short-Form Video", sub: "Reels & Shorts dominate discovery" },
      ],
    },
    reach: null,
    influencerTiers: INFLUENCER_TIERS,
    whatYouGet: {
      subtitle: "Every campaign is built around the right creator mix for your brand",
      items: [
        { title: "Curated Creator Roster", description: "Hand-picked mix of nano to mega creators matched to your brand and budget." },
        { title: "Multi-Format Content", description: "Reels, Stories, and posts crafted in each creator's authentic voice." },
        { title: "Category-Fit Targeting", description: "Creators selected for real audience overlap with your product category." },
        { title: "Campaign Reporting", description: "Reach, engagement, and content performance tracked across every creator." },
      ],
    },
    whyPartner: {
      items: [
        "Reach highly engaged, niche audiences through creators your customers already trust",
        "Build authentic brand credibility with content that doesn't feel like an advertisement",
        "Scale campaigns seamlessly across the full creator spectrum, from nano to mega",
        "Get transparent reporting tied to real reach and engagement, not vanity metrics",
      ],
      ask: (brandName) => `${brandName}, let's build a creator campaign around your story and your budget.`,
    },
  },
  both: {
    label: "Both",
    opportunity: PODCAST_OPPORTUNITY,
    reach: PODCAST_REACH,
    influencerTiers: INFLUENCER_TIERS,
    whatYouGet: PODCAST_WHAT_YOU_GET,
    whyPartner: PODCAST_WHY_PARTNER,
  },
  // Neither offer slide asked for. The rest of the deck still has to open, make
  // an opportunity, name a package and close, so it takes the combined copy —
  // the neutral one — and only the label says what was left out. Spelled out
  // rather than left to the `|| OFFER_VARIANTS.podcast` guard in the slides:
  // that guard is defence against a typo'd offer type, and a state a person can
  // deliberately choose should not be reaching it.
  none: {
    label: "No offer slides",
    opportunity: PODCAST_OPPORTUNITY,
    reach: PODCAST_REACH,
    influencerTiers: INFLUENCER_TIERS,
    whatYouGet: PODCAST_WHAT_YOU_GET,
    whyPartner: PODCAST_WHY_PARTNER,
  },
};

// Engagement rate falls predictably as an account grows, so benchmarks are
// tiered by follower count rather than one flat "industry average".
const ER_BENCHMARKS = [
  { maxFollowers: 10000, median: 3.5 },
  { maxFollowers: 100000, median: 1.9 },
  { maxFollowers: 1000000, median: 1.2 },
  { maxFollowers: Infinity, median: 0.9 },
];

export function benchmarkFor(followers) {
  const tier = ER_BENCHMARKS.find((b) => (followers || 0) <= b.maxFollowers) || ER_BENCHMARKS[ER_BENCHMARKS.length - 1];
  return { median: tier.median, strong: Math.round(tier.median * 2 * 10) / 10 };
}

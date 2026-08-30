// The tables behind lib/prospects.js. Split out for the same reason
// relevanceVocab.js is: these get hand-edited while staring at real headlines,
// and that is a different activity from editing the parser.

// The three feeds that survived checking. Each is India-first, free, and
// updates itself — the app polls, nothing is pushed to us.
//
// Deliberately not here: Inc42 and YourStory (their main feeds are mostly
// analysis and listicles, so the signal-to-noise is poor next to Entrackr),
// Moneycontrol and ET BrandEquity (both refuse datacenter fetches — they need
// a residential path this app does not have), and Google News RSS (no SLA, and
// its links are redirect URLs that need decoding first).
export const FEEDS = [
  {
    id: 'entrackr',
    name: 'Entrackr',
    url: 'https://entrackr.com/rss',
    // NOT /feed — that 404s, and half the RSS directories list it wrong.
    covers: 'funding',
  },
  {
    id: 'afaqs',
    name: 'afaqs!',
    url: 'https://www.afaqs.com/rss',
    covers: 'campaigns, ambassadors, people moves',
  },
  {
    id: 'bestmediainfo',
    name: 'BestMediaInfo',
    url: 'https://bestmediainfo.com/rss',
    covers: 'campaigns, people moves',
  },
];

// What kind of prospect a headline describes. Order matters: the first group
// whose verb appears wins, so the more specific triggers are listed first.
//
// `verbs` do double duty — they classify the item AND mark where the brand name
// ends, since Indian trade headlines almost always lead with the brand and then
// the verb ("Haldiram's launches…", "MMTC-PAMP appoints…").
export const TRIGGERS = [
  {
    id: 'funding',
    label: 'funding',
    // Money in the bank is the cleanest signal there is, so it outranks the rest.
    verbs: ['raises', 'raised', 'secures', 'bags', 'mops up', 'closes', 'picks up'],
  },
  {
    id: 'people',
    label: 'people',
    // A new marketing head has a budget to spend and something to prove.
    verbs: ['appoints', 'names', 'elevates', 'ropes in', 'hires', 'promotes'],
  },
  {
    id: 'ambassador',
    label: 'ambassador',
    // The budget is already approved by the time a face is signed.
    verbs: ['signs', 'onboards', 'taps', 'brings on board'],
    // Overrides whatever the verb said: "appoints X as brand ambassador" hits
    // the people verbs first, but it is an ambassador signing, not a hire.
    object: /(brand ambassador|ambassador for|face of the brand)/i,
  },
  {
    id: 'agency',
    label: 'agency',
    verbs: ['awards', 'assigns', 'hands over', 'wins the mandate for'],
  },
  {
    id: 'campaign',
    label: 'campaign',
    verbs: [
      'launches', 'unveils', 'rolls out', 'releases', 'drops', 'introduces',
      'debuts', 'kicks off', 'announces', 'presents', 'rebrands as', 'partners with',
    ],
  },
];

// Not prospects, however the headline reads. Investors fund brands, they do not
// buy influencer campaigns — Entrackr reports a fund's own raise in exactly the
// same shape as a brand's, so without this the feed's top item is regularly a VC.
export const NOT_A_BRAND = /\b(capital|ventures?|venture fund|vc fund|partners llp|advisors|asset management|securities|angels?|syndicate|incubator|accelerator)\b/i;

// Digests, rankings and opinion. All three feeds mix these in with real news and
// none of them names a single prospect.
export const NOISE = /\b(this week|last week|roundup|round-up|wrap|weekly|tracker|top \d+|best \d+|listicle|opinion|explained|explainer|how to|why |what |analysis|report:|survey|trends?|predictions?|outlook|in conversation|interview|podcast:|watch:|obituary)\b/i;

// Headline prefixes the outlets add before the brand ("Exclusive: X raises…").
export const HEADLINE_PREFIX = /^(exclusive|breaking|just in|scoop|update|opinion|guest column|watch|video|ipo watch)\s*[:—–-]\s*/i;

// A brand name longer than this is a parse that went wrong — the verb matched
// somewhere deep in a sentence rather than right after the subject.
export const MAX_BRAND_WORDS = 6;

// Agencies and PR firms announce their own staff hires in these same feeds, in
// the same shape as a brand announcing a CMO. They are OGM's competitors for the
// same budgets, so they must never read as prospects. Costs us the occasional
// real brand whose name ends in "Creative" — a fair trade for a lead list.
export const IS_AN_AGENCY = /\b(pr|public relations|communications?|comms|creative|advertising|agency|consulting|consultancy|studios?|worldwide)\b/i;

// A fund announcing its own corpus reads exactly like a brand launching a
// product — "TILT rolls out Rs 250 crore fund". The name alone cannot tell the
// two apart, so the rest of the headline has to.
export const FUND_NEWS = /\b(fund|corpus|limited partners?|investment vehicle|to invest in|for (seed|series|early)[- ]stage)\b/i;

// Ad platforms launching ad products. They sell to brands rather than buy what
// OGM sells, so a new ads suite is not a prospect however big the name is.
export const ADTECH_NEWS = /\b(ads? (product|platform|suite|solution|format|manager)|lead gen ads|ads? (to|in) india|ad ?tech|for (advertisers|marketers|sellers))\b/i;

// Which appointments actually mean a marketing budget is in play.
//
// Without this the `people` trigger fires on every CEO, CTO, comms and product
// hire in the trade press, none of which is a reason to pitch. A brand's new
// marketing head, though, has a budget and something to prove.
export const MARKETING_ROLE = /\b(cmo|chief marketing|chief growth|chief brand|marketing (head|director|lead|officer)|head of (marketing|brand|growth|digital)|brand (head|director|lead)|growth (head|lead|director)|vp,? marketing)\b/i;

// Entrackr leads with a sector descriptor before the name — "Logistics startup
// OORJAA raises…", "Kitchen and lifestyle brand Cüraa raises…". Everything up to
// and including the last such word is description, not the brand.
export const DESCRIPTOR_PREFIX = /^.*\b(startup|brand|platform|firm|company|app|chain|maker|marketplace|player|unicorn)\s+/i;

// The key two halves of the app join on: a brand somebody searched for, and a
// brand the trade press named. Both sides must compute it identically or a
// watched brand silently never matches its own news, so it lives here — the one
// file both sides already import — rather than in either of them.
//
// Legal suffixes go because a headline says "Mamaearth" where a website's title
// says "Mamaearth Pvt Ltd". Nothing else is stripped: taking "India" off would
// turn Air India into "air", and taking "the" off would collide The Souled
// Store with Souled Store — which is right, but the first one is not.
export function brandKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|incorporated|co)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

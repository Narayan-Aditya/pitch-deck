// Tuning data for creator-content matching. Deliberately separated from
// lib/relevance.js: these tables get hand-edited while staring at real
// output, and that shouldn't risk touching the scoring algorithm.

export const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'has', 'have', 'had',
  'its', 'their', 'they', 'them', 'you', 'your', 'our', 'his', 'her', 'she', 'him', 'who', 'whom',
  'what', 'when', 'where', 'which', 'will', 'would', 'can', 'could', 'should', 'been', 'being',
  'into', 'onto', 'over', 'under', 'about', 'after', 'before', 'more', 'most', 'some', 'such',
  'only', 'also', 'than', 'then', 'there', 'here', 'how', 'why', 'all', 'any', 'each', 'other',
  'out', 'off', 'not', 'but', 'via', 'per', 'one', 'two', 'new', 'get', 'got', 'make', 'made',
  'india', 'indian', 'company', 'companies', 'brand', 'brands', 'ltd', 'limited', 'pvt', 'private',
  'inc', 'llp', 'group', 'official', 'founder', 'ceo', 'best', 'top', 'know', 'like', 'just',
  'now', 'today', 'day', 'time', 'year', 'years', 'use', 'used', 'using', 'want', 'need',
  'miss', 'mr', 'mrs', 'shri',
]);

// Folds ONLY spelling variants, morphology and tight synonyms onto a canonical
// token. Semantic relatedness belongs in INDUSTRY_CONCEPTS below, NOT here.
//
// This distinction is load-bearing. An earlier version folded stock/trading/
// investing/insurance/banking all into "finance"; its document frequency rose
// to 75 of 654 reels and its IDF collapsed from ~0.8 to 0.35, which is exactly
// the discriminative power the whole ranking depends on. Same story for
// "lifestyle -> fashion", which made a real-estate reel and an alcohol reel the
// top matches for an apparel brand. Keep groups tight.
const VARIANT_GROUPS = {
  jewel: ['jewellery', 'jewelry', 'jeweller', 'jeweler', 'jewellry', 'jwellery', 'jewel', 'jewels',
    'ornament', 'ornaments', 'kundan', 'polki', 'meenakari'],
  gold: ['gold', 'golden', 'sona'],
  gem: ['diamond', 'gemstone', 'silver', 'platinum'],
  apparel: ['apparel', 'clothing', 'garment', 'menswear', 'womenswear', 'tshirt', 'kurta', 'saree'],
  textile: ['textile', 'fabric'],
  fashion: ['fashion', 'fashionable', 'couture'],
  eyewear: ['eyewear', 'spectacle', 'glasses', 'lens', 'lenses'],
  luggage: ['luggage', 'suitcase', 'backpack', 'trolley'],
  footwear: ['footwear', 'shoe', 'sneaker', 'sandal', 'juta'],
  beauty: ['beauty', 'cosmetic', 'skincare', 'makeup'],
  d2c: ['d2c', 'dtc'],
  ecommerce: ['ecommerce', 'onlinestore', 'shopify', 'marketplace'],
  retail: ['retail', 'store', 'showroom', 'outlet'],
  food: ['food', 'restaurant', 'cafe', 'cuisine', 'cloudkitchen'],
  fmcg: ['fmcg'],
  beverage: ['beverage', 'drink'],
  fitness: ['fitness', 'gym', 'workout'],
  health: ['health', 'healthcare', 'hospital', 'clinic', 'medical'],
  pharma: ['pharma', 'pharmaceutical'],
  finance: ['finance', 'financial', 'fintech'],
  stock: ['stock', 'stocks', 'stockmarket', 'sharemarket', 'broking', 'broker', 'trading', 'trader'],
  investment: ['investing', 'investment', 'investor'],
  insurance: ['insurance'],
  banking: ['banking', 'bank'],
  realestate: ['realestate', 'property', 'housing'],
  construction: ['construction', 'builder', 'infra'],
  tech: ['tech', 'technology', 'software', 'saas'],
  education: ['education', 'edtech', 'elearning', 'coaching'],
  auto: ['auto', 'automotive', 'automobile', 'car', 'vehicle'],
  ev: ['ev', 'electricvehicle'],
  travel: ['travel', 'tourism', 'trip'],
  hotel: ['hotel', 'hospitality', 'resort'],
  marketing: ['marketing', 'branding', 'advertising', 'ads'],
  socialmedia: ['socialmedia', 'influencer'],
  manufacturing: ['manufacturing', 'factory', 'production', 'industrial'],
  // Common British/US pairs that aren't category words
  color: ['colour', 'color'],
  organization: ['organisation', 'organization'],
  center: ['centre', 'center'],
  catalog: ['catalogue', 'catalog'],
};

export const VARIANTS = Object.entries(VARIANT_GROUPS).reduce((acc, [canonical, aliases]) => {
  for (const alias of aliases) acc[alias] = canonical;
  acc[canonical] = canonical;
  return acc;
}, {});

// Weighted expansion from a canonical concept to related concepts. This is
// what turns literal matching into "line of work" matching — e.g. a jewellery
// brand also matches fashion/accessory/D2C content, at reduced weight.
export const INDUSTRY_CONCEPTS = {
  jewel: { jewel: 1.0, gem: 0.65, gold: 0.6, fashion: 0.5, d2c: 0.35, retail: 0.3, ecommerce: 0.25 },
  gem: { gem: 1.0, jewel: 0.8, gold: 0.5, retail: 0.25 },
  gold: { gold: 1.0, jewel: 0.7, gem: 0.5, investment: 0.3 },
  fashion: { fashion: 1.0, apparel: 0.75, jewel: 0.4, footwear: 0.35, d2c: 0.35, retail: 0.3 },
  apparel: { apparel: 1.0, fashion: 0.8, textile: 0.5, footwear: 0.35, d2c: 0.4, retail: 0.35, ecommerce: 0.3 },
  textile: { textile: 1.0, apparel: 0.7, manufacturing: 0.45, fashion: 0.4 },
  eyewear: { eyewear: 1.0, fashion: 0.4, retail: 0.35, d2c: 0.35 },
  luggage: { luggage: 1.0, travel: 0.5, d2c: 0.45, retail: 0.3, fashion: 0.25 },
  footwear: { footwear: 1.0, fashion: 0.55, apparel: 0.45, d2c: 0.35, retail: 0.3 },
  beauty: { beauty: 1.0, d2c: 0.45, fashion: 0.35, retail: 0.3, health: 0.25 },
  d2c: { d2c: 1.0, ecommerce: 0.7, retail: 0.45, marketing: 0.4 },
  ecommerce: { ecommerce: 1.0, d2c: 0.7, retail: 0.5, marketing: 0.35 },
  retail: { retail: 1.0, d2c: 0.5, ecommerce: 0.45, marketing: 0.3 },
  food: { food: 1.0, beverage: 0.55, fmcg: 0.5, retail: 0.3, d2c: 0.3 },
  beverage: { beverage: 1.0, food: 0.6, fmcg: 0.5, d2c: 0.3 },
  fmcg: { fmcg: 1.0, food: 0.55, retail: 0.4, d2c: 0.35, manufacturing: 0.3 },
  fitness: { fitness: 1.0, health: 0.5, d2c: 0.3, beauty: 0.25 },
  health: { health: 1.0, pharma: 0.5, fitness: 0.4 },
  pharma: { pharma: 1.0, health: 0.7, manufacturing: 0.35 },
  finance: { finance: 1.0, investment: 0.6, banking: 0.55, stock: 0.5, insurance: 0.4, tech: 0.25 },
  stock: { stock: 1.0, investment: 0.85, finance: 0.7, banking: 0.35 },
  investment: { investment: 1.0, stock: 0.8, finance: 0.7, banking: 0.35, gold: 0.25 },
  insurance: { insurance: 1.0, finance: 0.6, banking: 0.3 },
  banking: { banking: 1.0, finance: 0.7, investment: 0.4, insurance: 0.3 },
  realestate: { realestate: 1.0, construction: 0.6, investment: 0.35 },
  construction: { construction: 1.0, realestate: 0.7, manufacturing: 0.4 },
  tech: { tech: 1.0, ecommerce: 0.3, marketing: 0.25 },
  education: { education: 1.0, tech: 0.3, marketing: 0.2 },
  auto: { auto: 1.0, ev: 0.6, manufacturing: 0.45 },
  ev: { ev: 1.0, auto: 0.8, manufacturing: 0.35 },
  travel: { travel: 1.0, hotel: 0.6, luggage: 0.3 },
  hotel: { hotel: 1.0, travel: 0.7, food: 0.3 },
  marketing: { marketing: 1.0, socialmedia: 0.6, d2c: 0.45 },
  socialmedia: { socialmedia: 1.0, marketing: 0.7 },
  manufacturing: { manufacturing: 1.0, textile: 0.3, auto: 0.25 },
};

// Content that criticises or exposes a brand. Surfacing one of these while
// pitching that same brand would be a deal-losing own goal — the corpus
// genuinely contains e.g. "Brands Are FOOLING You by Selling CHEAP Chinese
// Products" tagged with a real brand name.
export const NEGATIVE_SENTIMENT_RE =
  /\b(scam|scams|fool|fooling|fooled|expose|exposed|exposing|dark truth|fraud|cheap|fake|ghotala|lie|lies|lying|worst|avoid|beware|trap|loot|cheating)\b/i;

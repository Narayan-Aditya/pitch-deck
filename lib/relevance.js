// Deterministic relevance scoring between a prospect brand and the creator's
// back catalogue. Pure functions only — no fs, no network, no OpenAI — so
// this can be exercised standalone while calibrating thresholds.
// Explicit .js extensions here (and in creatorCorpus.js) so these modules can
// also be run directly by Node for the calibration harness, not only through
// the Next bundler.
import { STOPWORDS, VARIANTS, INDUSTRY_CONCEPTS, NEGATIVE_SENTIMENT_RE } from './relevanceVocab.js';

export const THRESHOLDS = {
  ITEM_FLOOR: 0.30,      // measured: true matches 0.34-0.68, best false positive 0.023
  GATE_IDF: 0.45,        // a match must hit at least one reasonably rare term
  MIN_ITEMS: 2,          // fewer than this and the slide isn't worth showing
  BRAND_BONUS: 100,      // separate tier, so exact-brand always outranks topical
  DEGRADED_FLOOR: 0.40,  // stricter floor when the AI rerank is unavailable
};

const FIELD_WEIGHTS = {
  youtube: { tags: 6.0, tagsPhrase: 4.8, title: 5.0, hashtags: 3.5, description: 2.0, MAX: 16.5 },
  instagram: { hashtags: 5.0, captionHead: 4.5, captionRest: 2.0, mention: 3.0, MAX: 11.5 },
};

// Instagram hashtags are lowercase and unsplit ("jewellerybusiness"); YouTube's
// are camelCase with a leading # ("#D2CBrands"). Splitting camelCase BEFORE
// lowercasing is what makes YouTube hashtags contribute at all.
function splitCamel(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

export function canonToken(word) {
  if (!word) return '';
  let t = String(word).replace(/^[#@]+/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (t.length <= 2) return '';
  if (STOPWORDS.has(t)) return '';
  // Crude singularise, but never turn "business" into "busines".
  if (t.length > 4 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  return VARIANTS[t] || t;
}

export function tokenize(text, { splitCamelCase = true } = {}) {
  if (!text) return [];
  const src = splitCamelCase ? splitCamel(String(text)) : String(text);
  const out = [];
  for (const raw of src.split(/[^A-Za-z0-9#@]+/)) {
    const t = canonToken(raw);
    if (t) out.push(t);
  }
  return out;
}

function tokenSet(text, opts) {
  return new Set(tokenize(text, opts));
}

// Brand names become phrases and a joined key, not topical terms — see
// buildQueryProfile. "Miss Jo" -> phrases ["miss jo"], key "missjo".
function brandForms(brandName) {
  const cleaned = String(brandName || '').trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { phrases: [], key: '', tokens: [] };
  const words = cleaned.split(' ');
  const key = words.join('');
  const tokens = words.filter(w => w.length >= 4 && !STOPWORDS.has(w));
  return { phrases: [cleaned], key, tokens };
}

export function buildQueryProfile({ brandName, industry, description }) {
  const terms = new Map();

  const add = (token, weight, src) => {
    if (!token) return;
    const existing = terms.get(token);
    if (!existing || weight > existing.w) terms.set(token, { w: weight, src });
  };

  for (const t of tokenize(industry)) {
    add(t, 1.0, 'industry');
    const concepts = INDUSTRY_CONCEPTS[t];
    if (concepts) {
      for (const [related, weight] of Object.entries(concepts)) {
        if (related !== t) add(related, weight, 'ontology');
      }
    }
  }

  // Deliberately low. At 0.45 a lab-reagents supplier matched an
  // Instagram-growth reel purely on the word "grade".
  for (const t of tokenize(description)) add(t, 0.30, 'desc');

  const sorted = [...terms.values()].map(v => v.w).sort((a, b) => b - a);
  const topFiveWeight = sorted.slice(0, 5).reduce((s, w) => s + w, 0) || 1;

  return { terms, ...brandForms(brandName), topFiveWeight };
}

// Exact-brand detection. Guarded so a brand called "The Fashion Co." can't
// match every fashion post: a single token only qualifies if it's long enough
// AND rare in the corpus; multi-word names must match as a contiguous phrase.
function detectBrandHit(item, query, df, corpusSize) {
  const { phrases, key, tokens } = query;
  if (!key) return null;

  const haystacks = item.platform === 'youtube'
    ? [['title', item.title], ['tags', (item.tags || []).join(' ')], ['description', item.descHead]]
    : [['caption', item.caption], ['mention', (item.mentions || []).join(' ')]];

  for (const [site, text] of haystacks) {
    if (!text) continue;
    const lower = String(text).toLowerCase();
    const squashed = lower.replace(/[^a-z0-9]/g, '');
    if (squashed.includes(key) && key.length >= 5) return site;
    for (const phrase of phrases) {
      if (phrase.includes(' ') && lower.includes(phrase)) return site;
    }
  }

  // Single-token fallback, only for distinctive tokens.
  for (const tok of tokens) {
    const rarity = (df.get(tok) || 0) / Math.max(corpusSize, 1);
    if (rarity >= 0.02) continue;
    if ((item.allTokens || new Set()).has(canonToken(tok))) return 'token';
  }
  return null;
}

export function scoreItem(item, query, idfMap, df, corpusSize) {
  const W = FIELD_WEIGHTS[item.platform];
  let best = 0;
  let bestTerm = null;
  let breadthSum = 0;
  let gate = false;
  const matchedTerms = [];

  for (const [term, { w: qw, src }] of query.terms) {
    let hit = 0;
    if (item.platform === 'youtube') {
      if (item.tagTokens.has(term)) hit += W.tags;
      else if (item.tagsText.includes(term)) hit += W.tagsPhrase;
      if (item.titleTokens.has(term)) hit += W.title;
      if (item.hashtagTokens.has(term)) hit += W.hashtags;
      if (item.descTokens.has(term)) hit += W.description;
    } else {
      if (item.hashtagTokens.has(term)) hit += W.hashtags;
      if (item.captionHeadTokens.has(term)) hit += W.captionHead;
      else if (item.captionRestTokens.has(term)) hit += W.captionRest;
      if (item.mentionTokens.has(term)) hit += W.mention;
    }
    if (!hit) continue;

    const strength = Math.min(hit / W.MAX, 1);
    const idf = idfMap.get(term) ?? 0.5;
    const contribution = qw * idf * strength;

    matchedTerms.push(term);
    breadthSum += contribution;
    if (contribution > best) { best = contribution; bestTerm = term; }
    // Specificity gate: description-only terms can raise a score but may never
    // on their own justify showing the slide.
    if ((src === 'industry' || src === 'ontology') && idf >= THRESHOLDS.GATE_IDF) gate = true;
  }

  const breadth = Math.min(breadthSum / query.topFiveWeight, 1);
  const score = 0.65 * best + 0.35 * breadth;

  const brandSite = detectBrandHit(item, query, df, corpusSize);
  const text = item.platform === 'youtube' ? item.title : item.caption;
  const sentimentRisk = !!brandSite && NEGATIVE_SENTIMENT_RE.test(text || '');

  return {
    score: Math.round(score * 1000) / 1000,
    best, bestTerm, gate,
    brandHit: !!brandSite,
    brandSite,
    sentimentRisk,
    matchedTerms,
  };
}

// Newer, better-performing content should win ties — the deterministic score
// saturates and produced a 15-way tie on one test brand.
function proofStrength(item, nowMs) {
  const engagement = item.views || item.likes || 0;
  const ageDays = nowMs ? (nowMs - new Date(item.publishedAt).getTime()) / 86400000 : 365;
  const recency = Math.pow(0.5, Math.max(ageDays, 0) / 365); // 1-year half-life
  return 0.6 * Math.log10(engagement + 10) + 0.4 * recency;
}

export function rankCandidates(items, query, idf, df, { limit = 12, minPerPlatform = 4, floor = THRESHOLDS.ITEM_FLOOR, nowMs = null } = {}) {
  const corpusSize = items.length;
  const scored = [];

  for (const item of items) {
    const idfMap = idf[item.platform];
    const r = scoreItem(item, query, idfMap, df[item.platform], corpusSize);
    // Exact-brand items bypass the floor and gate: a video literally about the
    // prospect is always worth surfacing (subject to the sentiment check).
    const passes = r.brandHit || (r.score >= floor && r.gate);
    if (!passes) continue;
    scored.push({
      ...item,
      ...r,
      finalScore: (r.brandHit ? THRESHOLDS.BRAND_BONUS : 0) + r.score,
      proof: proofStrength(item, nowMs),
    });
  }

  scored.sort((a, b) => (b.finalScore - a.finalScore) || (b.proof - a.proof));

  // Guarantee both platforms are represented in what the AI stage sees, so it
  // can build a cross-platform slide rather than three near-identical reels.
  const yt = scored.filter(s => s.platform === 'youtube');
  const ig = scored.filter(s => s.platform === 'instagram');
  const picked = [];
  const seen = new Set();
  const take = (arr, n) => {
    for (const s of arr) {
      if (picked.length >= limit || n <= 0) break;
      if (seen.has(s.id)) continue;
      seen.add(s.id); picked.push(s); n--;
    }
  };
  take(yt, minPerPlatform);
  take(ig, minPerPlatform);
  take(scored, limit);

  picked.sort((a, b) => (b.finalScore - a.finalScore) || (b.proof - a.proof));
  return picked.slice(0, limit);
}

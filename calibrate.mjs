// Calibration harness for the deterministic matching stage. Not part of the
// app — run with `node calibrate.mjs` from the project root.
import { loadCreatorCorpus } from './lib/creatorCorpus.js';
import { buildQueryProfile, rankCandidates } from './lib/relevance.js';

const CASES = [
  { brandName: 'Miss Jo', industry: 'Jewellery Design', description: 'Miss Jo designs and sells contemporary fine jewellery for women, sold direct to consumer online.', expect: 'SHOW' },
  { brandName: 'Zerodha', industry: 'Stock Broking', description: 'Zerodha is an Indian financial services company offering retail broking and trading platforms.', expect: 'SHOW' },
  { brandName: 'Bewakoof', industry: 'Apparel', description: 'Bewakoof is a D2C fashion brand selling casual apparel and printed t-shirts online.', expect: 'SHOW' },
  { brandName: 'Mokobara', industry: 'Luggage', description: 'Mokobara is a direct to consumer luggage and travel accessories brand.', expect: 'SENTIMENT CHECK' },
  { brandName: 'Arctic Trails', industry: 'Adventure Tourism', description: 'Arctic Trails operates guided polar expeditions and arctic wildlife tours in Norway.', expect: 'SKIP' },
  { brandName: 'Chemveda', industry: 'Laboratory Reagents', description: 'Chemveda supplies analytical grade reagents and contract research chemistry services.', expect: 'SKIP' },
];

const corpus = await loadCreatorCorpus();
console.log(`corpus: ${corpus.counts.youtube} youtube + ${corpus.counts.instagram} instagram\n`);

for (const c of CASES) {
  const query = buildQueryProfile(c);
  const ranked = rankCandidates(corpus.items, query, corpus.idf, corpus.df, { limit: 6, nowMs: Date.now() });
  const verdict = ranked.length >= 2 || ranked.some(r => r.brandHit) ? 'SHOW' : 'SKIP';
  const mark = verdict === (c.expect === 'SENTIMENT CHECK' ? verdict : c.expect) ? 'ok' : '** MISMATCH **';
  console.log(`${c.brandName} / ${c.industry} -> ${verdict} (expected ${c.expect}) ${mark}`);
  for (const r of ranked.slice(0, 4)) {
    const title = (r.title || r.captionHead || '').replace(/\n/g, ' ').slice(0, 74);
    const flags = [r.brandHit ? 'BRAND' : '', r.sentimentRisk ? 'SENTIMENT-RISK' : ''].filter(Boolean).join(' ');
    console.log(`   ${r.score.toFixed(3)} [${r.platform.slice(0, 2)}] ${title} ${flags ? '<' + flags + '>' : ''}`);
    console.log(`         via: ${r.bestTerm} | matched: ${r.matchedTerms.slice(0, 6).join(', ')}`);
  }
  if (!ranked.length) console.log('   (nothing passed the gates)');
  console.log('');
}

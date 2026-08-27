import OpenAI from 'openai';

// Which of the creator's existing videos to show on the track-record slide.
//
// This file used to also write the brand overview, the Instagram insight and
// the audience-fit paragraph for the report page. That page is gone, and with
// it three API routes and most of this file — what is left is everything
// /api/creator-matches still calls.

const RESEARCH_MODEL = process.env.OPENAI_RESEARCH_MODEL || 'gpt-4.1-mini';


// Constructed per call, not at module scope, so a missing key surfaces as a
// failed generation step the user can work around by typing the field in —
// building the client on import would instead fail the whole deploy's build.
function client() {
  if (!process.env.OPENAI_API_KEY) {
    // Fragments, not sentences: the report page renders these inside
    // "Couldn't do this automatically: {error} — fill it in below."
    throw new Error(
      process.env.VERCEL
        ? 'the AI key is missing on the server (set OPENAI_API_KEY in Vercel, then redeploy)'
        : 'the AI key is missing (set OPENAI_API_KEY in .env.local, then restart)'
    );
  }
  return new OpenAI();
}

function parseJsonLoose(text) {
  const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
  const raw = match ? match[1] : text;
  return JSON.parse(raw);
}

function stripCitations(text) {
  return text
    // ([label](url)) — the full parenthesised citation form
    .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, '')
    // [label](url) — keep the label, drop the link
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // any bare url left over, optionally wrapped in parens
    .replace(/\s*\(?\bhttps?:\/\/\S+\)?/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

export async function rankCreatorContent({ brandName, about, candidates, limit = 3 }) {
  const list = candidates.map((c, i) => {
    const kind = c.platform === 'youtube' ? 'youtube long-form episode' : 'instagram reel';
    const label = c.platform === 'youtube'
      ? `title: ${c.title}\n   tags: ${(c.tags || []).slice(0, 14).join(', ')}`
      : `caption: ${(c.captionHead || '').replace(/\n/g, ' ').slice(0, 160)}\n   hashtags: ${(c.hashtags || []).slice(0, 8).join(', ')}`;
    // Surfacing why it was shortlisted matters: a YouTube title like "How She
    // Built a Rs100 Crore Business" hides that its tags are all jewellery.
    const why = c.matchedTerms?.length ? `\n   topic overlap: ${c.matchedTerms.slice(0, 6).join(', ')}` : '';
    const flag = c.sentimentRisk ? '\n   ⚠ MENTIONS THIS BRAND — may be critical of it' : '';
    return `${i + 1}. id: ${c.id} [${kind}]\n   ${label}${why}${flag}`;
  }).join('\n\n');

  const prompt = `You are choosing which of a creator's existing videos/reels to show on a pitch-deck slide for the brand below. The slide's message is "we already make content in your space."

BRAND: ${brandName}
INDUSTRY: ${about?.industry || 'Unknown'}
WHAT THEY DO: ${about?.description || 'Unknown'}

CANDIDATES (already pre-filtered as plausible — your job is to drop the ones that only LOOK related):
${list}

Pick UP TO ${limit}. For each, judge:
- relevance: "direct" (clearly about this brand's category or the brand itself), "adjacent" (a related business/category the prospect would still find relevant), or "weak" (drop it).
- If the ONLY connection you can state is that both are businesses, or both are Indian, or both involve entrepreneurship — mark it "weak".
- reason: at most 18 words, naming the concrete shared topic. This is printed on the slide, so write it for the prospect to read.
- sentiment: "positive", "negative" or "neutral" — does the content praise or criticise the brand named above? Be strict: anything mocking, exposing, doubting or warning about it is "negative". Use "neutral" when the content does not mention the brand at all.

Selection guidance:
- If several candidates are genuinely relevant, return the full ${limit} — don't be needlessly conservative.
- Prefer a MIX of youtube episodes and instagram reels; a long-form episode is the strongest proof we cover a category, so include one when it genuinely fits.
- Judge a youtube episode on its topic overlap and tags, not only its title — titles often lead with the guest's revenue rather than the category.
- Returning zero or one pick is still valid when nothing else genuinely fits — do not pad the list with weak matches.

Return ONLY valid JSON, no markdown fences:
{"picks":[{"id":"...","relevance":"direct","reason":"...","sentiment":"positive"}]}`;

  const response = await client().responses.create({
    model: RESEARCH_MODEL,
    input: prompt,
  });

  const parsed = parseJsonLoose(response.output_text);
  const picks = Array.isArray(parsed?.picks) ? parsed.picks : [];
  return picks.map(p => ({
    id: String(p.id ?? '').trim(),
    relevance: p.relevance === 'direct' || p.relevance === 'adjacent' ? p.relevance : 'weak',
    reason: trimToWords(stripCitations(String(p.reason || '').trim()), 18),
    sentiment: p.sentiment || 'neutral',
  }));
}

// Models treat "at most 100 words" as a soft target and routinely overshoot,
// so enforce it here — the slide's text box is fixed-height and longer copy
// gets visibly clipped. Cuts at a sentence boundary when one is close to the
// limit, otherwise hard-truncates with an ellipsis.
function trimToWords(text, limit) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= limit) return text;

  const clipped = words.slice(0, limit).join(' ');
  const lastSentenceEnd = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('! '),
    clipped.lastIndexOf('? ')
  );
  if (lastSentenceEnd > clipped.length * 0.6) {
    return clipped.slice(0, lastSentenceEnd + 1);
  }
  return `${clipped.replace(/[,;:]$/, '')}…`;
}

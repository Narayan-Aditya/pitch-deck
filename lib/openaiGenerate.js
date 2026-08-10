import OpenAI from 'openai';

const RESEARCH_MODEL = process.env.OPENAI_RESEARCH_MODEL || 'gpt-4.1-mini';

// Constructed per call, not at module scope, so a missing key surfaces as a
// failed generation step the user can work around by typing the field in —
// building the client on import would instead fail the whole deploy's build.
function client() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      process.env.VERCEL
        ? 'OPENAI_API_KEY is not set — add it under Project Settings → Environment Variables and redeploy'
        : 'OPENAI_API_KEY is not set in .env.local'
    );
  }
  return new OpenAI();
}

function parseJsonLoose(text) {
  const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
  const raw = match ? match[1] : text;
  return JSON.parse(raw);
}

// Overview — returns the about-fields. Instructed to write "Unknown" rather
// than guess, since this lands on a client-facing pitch deck: a wrong founding
// year is worse than an absent one.
//
// The brand's own Instagram bio and business category are free (we already
// scrape the profile) and authoritative about what they sell. Measured on
// real brands, grounding on them fixes the industry that an ungrounded model
// gets wrong — Palmonas "Fashion Accessories" -> "Jewelry", Bear House
// "Outdoor apparel" -> "Clothing", Mokobara "Fashion" -> "Travel Gear" — and
// costs ~1% of a web search. Search is still used when the profile is bare
// (plenty of accounts have no bio and no category at all), because ungrounded
// guessing is how a bubble-tea brand gets labelled "Streetwear Fashion".
//
// Founding year and headquarters only come back from search. They are shown
// in the web UI but never printed on any slide, so losing them on the cheap
// path costs the deck nothing.
function hasUsableProfile(profile) {
  return !!(profile?.biography?.trim() || profile?.ig_category?.trim());
}

// A profile can be present but say nothing useful — Mokobara's Instagram
// category is literally "Brand" and its bio is a slogan, which grounds out to
// industry: "Brand". That's worse than useless: `industry` drives the
// creator-content matching, so a vague value quietly produces an irrelevant
// videos slide. Rather than trying to predict this from the profile, judge the
// RESULT and pay for a search only when the cheap answer came back vague.
const VAGUE_INDUSTRY = new Set([
  'brand', 'business', 'company', 'product', 'service', 'product/service',
  'products', 'services', 'unknown', 'other', 'general', 'miscellaneous',
  'personal blog', 'digital creator', 'entrepreneur', 'public figure', 'n/a',
]);

function isVagueIndustry(industry) {
  const s = String(industry || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return !s || VAGUE_INDUSTRY.has(s);
}

const OVERVIEW_SHAPE = `Return ONLY a valid JSON object, no markdown fences, in exactly this shape:

{
  "tagline": "punchy ~10-15 word positioning line, not a generic marketing cliche",
  "description": "factually accurate 3-5 sentence paragraph: what they sell/do, positioning, anything distinctive. No filler, no invented facts.",
  "industry": "short category label",
  "foundedYear": "year, or 'Unknown'",
  "headquarters": "city/country, or 'Unknown'"
}

Write "Unknown" rather than inventing anything. Never guess a founding year or headquarters.

FORMATTING: plain prose only. Do NOT include citations, source names, markdown links, footnotes, or URLs anywhere in the values — this copy is pasted straight onto a client-facing slide.`;

function buildOverviewPrompt(brandName, instagram, profile, grounded) {
  return grounded
    ? `You are a research analyst. Write short brand copy about the brand below, grounded ONLY in the verified profile data provided.

BRAND:
- Name: ${brandName}
- Instagram: ${instagram || 'not provided'}

VERIFIED INSTAGRAM PROFILE (read directly from their own account — treat this as ground truth about what they sell and who they are):
- Bio: ${profile.biography || '(empty)'}
- Instagram business category: ${profile.ig_category || '(none)'}
- Link in bio: ${profile.external_url || '(none)'}

Base the industry on the profile above, not on guesswork. If the profile doesn't establish the founding year or headquarters, write "Unknown" for them — do not infer them.

${OVERVIEW_SHAPE}`
    : `You are a research analyst. Use web search to gather CURRENT, REAL, VERIFIABLE facts about the brand below, then write short brand copy grounded ONLY in what you verified.

BRAND:
- Name: ${brandName}
- Instagram: ${instagram || 'not provided'}

TASKS:
1. Find the brand's official website and what it actually sells/does.
2. Determine its industry/category in one short phrase.
3. Find founding year and headquarters if publicly available.

${OVERVIEW_SHAPE}`;
}

async function runOverview(brandName, instagram, profile, grounded) {
  const request = { model: RESEARCH_MODEL, input: buildOverviewPrompt(brandName, instagram, profile, grounded) };
  if (!grounded) request.tools = [{ type: 'web_search' }];
  const response = await client().responses.create(request);
  const parsed = parseJsonLoose(response.output_text);
  for (const key of Object.keys(parsed)) {
    if (typeof parsed[key] === 'string') parsed[key] = stripCitations(parsed[key]);
  }
  return parsed;
}

export async function generateOverview({ brandName, instagram, profile }) {
  if (hasUsableProfile(profile)) {
    try {
      const cheap = await runOverview(brandName, instagram, profile, true);
      if (!isVagueIndustry(cheap.industry)) return cheap;
    } catch {
      // fall through to the search pass
    }
  }
  return runOverview(brandName, instagram, profile, false);
}

// The web_search tool appends inline source citations like
// "([cbinsights.com](https://...?utm_source=openai))" into prose. Telling
// the model not to do it isn't reliable, and these would otherwise be pasted
// verbatim onto a client-facing slide — so strip them here too.
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

// Instagram tab — writes the "What This Means" paragraph. The numbers are
// real (measured by ig_data.py), so this call only INTERPRETS them; it must
// not restate them altered. No web search needed — everything it reasons
// from is passed in.
export async function generateInsight({ brandName, analytics }) {
  const prompt = `You are writing the "What This Means" insight paragraph for one slide of a podcast/influencer-marketing pitch deck from Open Grey Media to the brand below.

BRAND: ${brandName}

REAL MEASURED INSTAGRAM ANALYTICS (these exact numbers appear on the same slide — interpret them, never contradict or restate them with different values):
${JSON.stringify(analytics, null, 2)}

Write ONE paragraph of AT MOST 100 WORDS (hard limit — count them; it must fit a fixed-size slide text box) that:
- References the actual engagement rate, posting frequency, and content mix above
- Explains what they imply for an Instagram influencer/podcast marketing opportunity (e.g. under-posting, engagement rate vs. typical benchmarks for that follower tier, content-mix gaps a podcast/reels push could fill)
- Is specific and useful to a salesperson pitching this brand — not generic filler

Plain prose only: no bullet points, no headings. Return ONLY the paragraph text — no JSON, no surrounding quotes, no preamble. Stay under 100 words.`;

  const response = await client().responses.create({
    model: RESEARCH_MODEL,
    input: prompt,
  });

  return trimToWords((response.output_text || '').trim(), INSIGHT_WORD_LIMIT);
}

// "Why This Fits" — the bridge slide. Connects Open Grey's audience to the
// brand's customer, which the deck otherwise leaves the reader to infer.
export async function generateAudienceFit({ brandName, about, analytics }) {
  const prompt = `Write the "Why This Fits" paragraph for a pitch deck from Open Grey Media (an Indian podcast + influencer marketing company) to the brand below.

BRAND: ${brandName}
WHAT THEY DO: ${about?.description || about?.industry || 'Not specified'}
THEIR INSTAGRAM: ${analytics ? `${analytics.followers?.toLocaleString()} followers, ${analytics.engagementRatePct}% engagement` : 'Not available'}

OPEN GREY MEDIA'S AUDIENCE (fixed facts — use these, don't invent others):
- 2M+ followers across YouTube and Instagram
- 15M+ monthly views
- 76% aged 18-34
- Focused on business, finance and startups

Write ONE paragraph of AT MOST 70 WORDS explaining specifically why this brand's target customer overlaps with Open Grey's audience, and what an episode would put in front of them. Be concrete about the overlap — avoid generic claims that would apply to any brand.

Plain prose only. No citations, links, headings or bullet points. Return ONLY the paragraph.`;

  const response = await client().responses.create({
    model: RESEARCH_MODEL,
    input: prompt,
  });

  return trimToWords(stripCitations((response.output_text || '').trim()), AUDIENCE_FIT_WORD_LIMIT);
}

// Creator-content slide — picks the best few from an already-prefiltered
// shortlist and writes the one-line "why this is relevant" for each card.
// The deterministic stage guarantees topical overlap; this stage supplies
// precision and copy, and adjudicates the sentiment-risk items.
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

const INSIGHT_WORD_LIMIT = 100;
const AUDIENCE_FIT_WORD_LIMIT = 70;

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

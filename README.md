# Brand Pitch Report Generator

Turns a brand name and an Instagram handle into an editable PowerPoint pitch
deck for Open Grey Media. The report page fills itself in — brand summary,
Instagram numbers, the "what their numbers mean" paragraph, and which of the
creator's past videos are relevant to that prospect — and you correct anything
that looks wrong before hitting Download.

Sign-in is Google via Supabase, and reports live in Postgres, so they follow a
person to any device. Every report created and every deck downloaded is
recorded, so `/admin` can show who on the team is actually shipping decks.

## Local development

```bash
npm install
cp .env.example .env.local   # OPENAI_API_KEY + the two Supabase vars
npm run dev
```

Open http://localhost:3000.

## Supabase setup

1. Create a project, then copy Project Settings → API → **Project URL** and the
   **anon public** key into `.env.local`. Never the `service_role` key.
2. Google Cloud → Credentials → OAuth client ID (Web). Authorized redirect URI:
   `https://<your-ref>.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → Google: paste the client ID/secret.
   Under URL Configuration set the Site URL and add both
   `http://localhost:3000/**` and your production URL as redirect URLs.
4. Run `supabase/migrations/0001_init.sql` in the SQL editor, then
   `supabase/migrations/0002_slides_export.sql`. Both are idempotent, so
   re-running them after a schema change is safe.
5. Make yourself an admin after your first login:
   `update public.profiles set is_admin = true where email = 'you@example.com';`

### Security model

The browser talks to Postgres directly with the anon key, so **row level
security is the access control** — not the UI, and not the API routes. Three
things enforce it:

- Every table has RLS on: you see your own rows, admins see everyone's.
- `profiles` has **no update policy at all**. RLS cannot restrict individual
  columns, so a policy permitting someone to edit their own row also permitted
  setting `is_admin = true` and reading the whole team's data. That was a real
  bug, caught by the script below. A trigger now blocks changes to that column
  from the client as a second line of defence.
- `proxy.js` refuses unauthenticated requests to `/api/*`, which is what stops
  a stranger with the URL from spending the OpenAI budget or driving the
  Instagram session.

After changing any policy, run the checks:

```bash
node scripts/verify-rls.mjs
```

It signs up two throwaway accounts with the anon key and tries to read, edit
and impersonate across them. A broken policy is silent — it returns rows rather
than raising — so this is the only thing that will tell you.

## Deploying to Vercel

```bash
npm i -g vercel
vercel          # preview deploy
vercel --prod   # production
```

Or push to GitHub and import the repo at vercel.com/new. No `vercel.json` is
needed — the framework preset handles it.

**Set `OPENAI_API_KEY` in Project Settings → Environment Variables.** It is the
only required variable. `.env.local` is gitignored and never reaches the
deploy, so without this every auto-generated step fails and has to be typed in
by hand. See `.env.example` for the optional ones.

### Instagram numbers once deployed

`/api/ig-fetch` is plain HTTP against Instagram's own endpoints (`lib/instagramScrape.js`),
so it works on Vercel — but only if **`IG_SESSIONID` is set in Project Settings
→ Environment Variables.** Without it every lookup fails with "no Instagram
login is saved on the server" and the numbers have to be typed in by hand.

Opening a report with no numbers on it fires that lookup automatically, once.
Re-opening a report that already has numbers does not: each lookup spends four
requests against a real logged-in account, and `lib/instagramScrape.js` carries
a ten-minute throttle circuit-breaker for when Instagram starts pushing back.
"↻ Get latest" is the manual re-fetch.

One thing genuinely does not survive the deploy, and it is not a bug:

- **`/api/ig-stats`** reads `stats.json`, which is `ig_data.py` output and is
  kept off the deploy by `.vercelignore`. It degrades to "no stats" rather than
  erroring, and the live lookup above covers the gap.

  `.gitignore` alone is not enough here: the Vercel CLI uploads the working
  directory without applying it, so a `vercel` deploy shipped one developer's
  `stats.json` and served that brand's numbers to everyone. `.vercelignore` is
  what actually keeps it out, and what makes a CLI deploy match a Git-connected
  one. (The CLI does exclude `.env*` by itself — secrets are not affected.)

Creator-content matching *does* work deployed: `nitin josi data/` is committed
and traced into the function bundle via `outputFileTracingIncludes` in
`next.config.mjs`.

Every route that calls the model sets `maxDuration = 60`, because the
serverless default of 10s is not enough for a completion and the route would
otherwise 504 in production while working fine locally.

## How it fits together

| Path | Role |
| --- | --- |
| `app/page.js` | Dashboard — lists saved reports |
| `app/new-report/page.js` | Brand name + Instagram handle, creates the report |
| `app/report/[id]/page.js` | The 7-step guided editor and the Download button |
| `lib/buildPptx.js` | Builds the deck with pptxgenjs, in the browser |
| `lib/deckStyles.js` | The five looks a deck can be built in |
| `lib/reportStore.js` | Report persistence on Supabase Postgres |
| `lib/openaiGenerate.js` | All four generation calls |
| `lib/relevance.js`, `lib/creatorCorpus.js` | Scores the creator's back catalogue against the prospect |
| `app/api/creator-library/route.js` | Search that catalogue by hand, for the picker in step 5 |
| `lib/instagramScrape.js` | Live Instagram lookup over HTTP — works deployed |
| `lib/creatorStats.js` | **Generated.** The creator's own numbers and collab list |
| `scripts/build-creator-stats.mjs` | Regenerates the above from `nitin josi data/` |
| `ig_data.py` | Bulk Instagram scraper — local only, writes `stats.json` |

Optional slides drop out when their content is empty, so a deck is 7–12 slides
depending on how much has been filled in. A blank pricing slide in front of a
client is worse than no pricing slide.

### The creator's own numbers

Two slides are about Open Grey Media rather than the prospect: **Nitin Joshi**
(measured Instagram and YouTube figures, benchmarked against accounts of the
same size) and **Brands We've Worked With** (three Instagram collaborations and
three podcast episodes).

Both read `lib/creatorStats.js`, which is generated — the deck is built in the
browser and the dumps in `nitin josi data/` are 1.9MB, which has no business
being shipped to a visitor to print twelve numbers. After re-scraping either
dump:

```bash
node scripts/build-creator-stats.mjs   # rewrites lib/creatorStats.js — commit it
```

The collaborations are not guessed from captions. Instagram marks them itself
(`sponsors`, `coauthorProducers`), and each podcast description names its
guest's company, so both lists are derived rather than curated. The report page
seeds its editable fields with the best-performing three of each; the rest are
in the file, one dropdown away.

The follower count is the one figure the Instagram dump cannot supply — it has
no profile record — so it is set by hand at the top of the generator script.

No slide carries a video poster. Every video is its title plus a visible
"View ↗" link, because a bare PowerPoint hyperlink is invisible until hovered
and reads as a dead end. That is also why the deck embeds no images at all:
nothing is fetched at export time, and a finished deck is around 280KB.

### Export to Google Slides

The **Export to Google Slides** button uploads the same `.pptx` the download
button builds into the signed-in user's Drive, with
`mimeType: application/vnd.google-apps.presentation` — Drive converts on upload,
so no Slides-API step is needed (`lib/googleSlides.js`). The resulting link is
saved on the report, so it survives a reload and sits on the sticky bar.

**The request body is `multipart/related`, assembled by hand.** Drive's
`uploadType=multipart` is not `multipart/form-data`, so the obvious `FormData`
body — which is what the pre-571d197 version used — is rejected with a bare
`400 Bad Request` and no explanation. Metadata part first, file second, CRLF
line endings, blank line between a part's headers and its body, `--` on the
closing boundary. Get any of those wrong and it is the same opaque 400.

This is the same converter you get by dragging the file into Drive by hand. **The
button saves clicks; it does not improve fidelity.** If a style looks wrong in
Slides, it will look equally wrong either way — Google substitutes fonts it does
not have, and Classic (Calibri, Helvetica Neue) and Minimal (Segoe UI) are more
exposed to that than Editorial (Georgia) or Bold (Trebuchet MS).

Setup, beyond the two migrations:

1. Google Cloud → **OAuth consent screen** → add the scope
   `https://www.googleapis.com/auth/drive.file`. This is the narrow, per-file
   scope — it reaches only files this app created, never the rest of a Drive —
   and unlike full `drive` it is **not** a restricted scope, so it needs no
   Google verification review.
2. Nothing to change in Supabase. The scope is requested by
   `signInWithOAuth` in `lib/AuthContext.js`, not configured in the dashboard.
3. Anyone already signed in consented before Drive was ever asked for, so their
   first export gets a 403. The button turns into **Connect Google Drive**,
   which re-runs consent with `prompt=consent` and returns them to the report.

The one awkward part is the token. Supabase hands back `provider_token` once, on
the session minted at the OAuth exchange, and never refreshes it — so
`AuthContext` copies it into `sessionStorage` the moment it appears. It dies with
the tab, and Google expires it in about an hour; after that the export 403s and
the reconnect button appears. That is the trade for not storing a Google refresh
token in Postgres.

### Deck styles

A report picks one of five styles — **Classic, Midnight, Editorial, Bold,
Minimal** — and the choice is stored on the report, so reopening it downloads
the same look. Reports made before styles existed have no key and fall back to
Classic, which reproduces the original deck exactly.

A style is a palette, two typefaces, and the header bar's height
(`lib/deckStyles.js`). **Slide layout is shared** — every x/y/w/h in
`buildPptx.js` was measured against a real reference deck, and five independent
sets of coordinates would be five sets to keep from overlapping. If you want
styles that also move things around, that is a bigger change than adding a
palette.

Adding a style means adding one entry to `DECK_STYLES`. Two tokens are easy to
get wrong:

- `lightBg` must read as *slightly off* `bg`, not "light" — on Midnight it is
  darker than the background, not lighter.
- `charWidth` is the average glyph width as a fraction of font size, used by
  `estimateTextHeight()` to guess where text wraps. Georgia sets about 8% wider
  than Helvetica; leaving this at the default overflows text boxes on a serif
  style, and nothing catches it until someone opens the deck.

No hex literal belongs in `buildPptx.js` — a colour hardcoded there is a style
only one deck can use.

### Picking creator content by hand

Step 5 fills itself from `/api/creator-matches`, which scores the catalogue
against the prospect and involves a model call. When that guesses wrong — or
when you already know which reel you want — **Browse our videos** searches all
685 items directly through `/api/creator-library`.

That is a plain substring search, not the relevance scorer: `lib/relevance.js`
canonicalises tokens for topical matching, which is exactly wrong when someone
is typing words they remember from a title. Every word has to appear in the
post (AND, not OR) — on a catalogue this small, OR returns 468 results for
"food business" and AND returns 25.

It is a route rather than a generated client-side index because 685 items is
more than a picker used a few times a day should cost every page load. Both
creator routes share `toWireItem()` in `lib/creatorCorpus.js`, so anything
picked from either lands in `creatorMatches` in the same shape.

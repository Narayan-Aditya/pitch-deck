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
4. Run `supabase/migrations/0001_init.sql` in the SQL editor. It is idempotent,
   so re-running it after a schema change is safe.
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

### What does not work once deployed

Both are consequences of serverless hosting, not bugs:

- **"↻ Get latest" Instagram numbers.** `/api/ig-fetch` shells out to
  `ig_data.py`, and Vercel has neither a Python runtime nor a writable
  filesystem. The route detects this and says so; enter the numbers by hand, or
  run the scraper locally and read them off `stats.json`.
- **Instagram auto-fill on page load.** `/api/ig-stats` reads `stats.json`,
  which is scraper output and is kept off the deploy by `.vercelignore`. It
  degrades to "no stats" rather than erroring.

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
| `app/report/[id]/page.js` | The 6-step guided editor and the Download button |
| `lib/buildPptx.js` | Builds the deck with pptxgenjs, in the browser |
| `lib/reportStore.js` | localStorage persistence |
| `lib/openaiGenerate.js` | All four generation calls |
| `lib/relevance.js`, `lib/creatorCorpus.js` | Scores the creator's back catalogue against the prospect |
| `ig_data.py` | Instagram scraper — local only, writes `stats.json` |

Optional slides drop out when their content is empty, so a deck is 6–10 slides
depending on how much has been filled in. A blank pricing slide in front of a
client is worse than no pricing slide.

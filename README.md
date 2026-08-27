# OGM Pitch Deck

Paste a prospect's website, get an eleven-slide proposal coloured to their
brand, and send it straight into Google Slides.

Sign-in is Google via Supabase. Every deck built, downloaded and exported is
recorded, so `/admin` can show who on the team is shipping decks and how much
of the Instagram allowance each person has spent.

```bash
npm install
npm run dev          # http://localhost:3000
```

Copy `.env.example` to `.env.local` first — the app runs without the optional
keys, but not without Supabase.

## The flow

```
/pitch-deck
  1  POST /api/brand            their site: name, About copy, socials, brand colour
  2  POST /api/ig-fetch         the Instagram account their site links to  ← the paid call
  3  POST /api/creator-matches  our own content, scored against their About copy
     GET  /api/creator-library  or search the archive by hand
  →  build the deck in the browser, upload to Drive as Slides
```

Only the first step can stop a run. The other two have a defined fallback on
the slide, so a prospect with no Instagram and no matching content still gets a
deck — it swaps a brand portrait in for the audit slide, and prints a
placeholder line where the proof would go.

## The deck

`lib/deck/` is the exporter, and it is a copy of a separately-developed deck
rather than something to edit casually — `npm run audit:deck` builds eleven
fixture decks and checks that no text overlaps another run or an image, and
that every picture is placed at its own aspect ratio. Run it after any change
in there.

Nine slides are unconditional. The Instagram audit slide and the brand portrait
are alternatives, so that pair is always exactly one. Each offer kind selected —
podcast, influencer marketing — adds its own slide, which is why the count runs
9, 10, 11 rather than being fixed.

`lib/deckAdapter.js` is where this app's shapes meet the deck's. Adapting there
rather than editing `lib/deck/` is what keeps that directory identical to the
copy the audit harness checks.

### Colour

`lib/brandColour.js` reads the brand's own CSS custom properties out of the
static HTML. It is deliberately browser-free: the version this replaced
headless-rendered the page and sampled computed CSS, and against one real
storefront it sampled fourteen unstyled `<a>` tags, concluded the brand colour
was `#0000EE` — the browser's default link blue — and themed a black-and-white
luxury brand in indigo. The real colour was in a `--color-button` property in
the HTML the whole time.

When a site gives up no chromatic signal at all, that is a real answer: the
deck seeds a ground from the domain instead, so the same prospect always gets
the same deck.

## What costs money

One thing: the Instagram lookup. Everything else is a public page or a file on
disk.

- **Cached** in `audit_cache`, keyed on the handle with `@` stripped and the
  case folded. `AUDIT_CACHE_TTL_DAYS` (default 7) decides how long an answer
  stands — that is the knob for how much browse2api bills.
- **Capped** at `INSTAGRAM_MONTHLY_LIMIT` (default 20) per person per calendar
  month, counted from `lookup_events`, which only the server writes and only
  with the service key. A cache hit is free and is never counted against it.
- **Failed over** to Apify when browse2api is down, out of quota, has its key
  disabled, or returns an empty profile. With no Apify token configured,
  browse2api's own error surfaces instead.

Both degrade to no-ops without `SUPABASE_SERVICE_KEY`, and a Supabase outage
fails open — locking the team out mid-pitch is worse than a few uncounted
lookups.

## Supabase

Run the migrations in order, by hand, in the SQL editor:

```
supabase/migrations/0001_init.sql              profiles, reports, deck_events, RLS
supabase/migrations/0002_slides_export.sql     the slides_exported action
supabase/migrations/0003_audit_cache_quota.sql audit_cache, lookup_events, the month's lookups
```

Then make yourself an admin — it cannot be done from the app, because a trigger
rejects the change whenever `auth.uid()` is set, which it always is from a
browser:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

`audit_cache` and `lookup_events` have RLS on with **no policies at all**. That
is the intent: only the service_role key reaches them, and no browser should.

### The reports table

Still written on export, no longer read. It is the only record of *which*
prospect was pitched, it costs one insert, and it would be unrecoverable if
dropped — the admin dashboard counts from `deck_events` instead. See the note
at the top of `lib/reportStore.js`.

## Deploying

Vercel, Node runtime. `/api/brand` pins `runtime = 'nodejs'` because
`lib/brandColour.js` uses sharp to read the logo bitmap, and the edge runtime
has no native binary for it. Both scraping routes set `maxDuration = 60`.

`next.config.mjs` traces `nitin josi data/**` into the `/api/creator-*`
functions — those read the archive off disk at request time, and without the
trace the routes find nothing once deployed.

One thing crossing from the Python service this replaced is worth knowing
rather than discovering: that version's HTTP client presented a real browser's
TLS fingerprint, and Node's does not. Sites behind Cloudflare that it walked
through may answer this one with a challenge page, and serverless egress makes
that likelier. A residential proxy fixes the address, not the handshake.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run audit:deck   # eleven fixture decks, checked for overlap and crop
node calibrate.mjs   # relevance tuning against the creator corpus
```

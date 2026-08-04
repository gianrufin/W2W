# Cinema data sources

How every screening in W2W gets there: the shape it is stored in, the endpoint
it came from, and what happens when a source lies, stalls or disappears.

Companion to [`DEVELOPING.md`](DEVELOPING.md). Code lives in `lib/scrapers/`.

---

## 1. The data model

Three tables, one document shape. Scrapers emit the JSON below; the pipeline
(`lib/scrapers/pipeline.ts`) upserts it into Postgres.

### The scrape document

Every scraper returns exactly this, whatever it had to do to get it:

```jsonc
{
  "source": "robinsons-movieworld",   // stable id, written to showtimes.source
  "cinemas":   [ /* ScrapedCinema */ ],
  "movies":    [ /* ScrapedMovie   */ ],
  "showtimes": [ /* ScrapedShowtime */ ],
  "errors":    [ "…human-readable, one per failure" ]
}
```

Cinemas and movies are joined to showtimes **by slug**, not by array index or
object nesting. That is what lets six sources describe the same country without
coordinating: each owns its own slug namespace, and the pipeline resolves slugs
to UUIDs at write time.

### `ScrapedCinema`

```jsonc
{
  "name":  "Robinsons Movieworld Galleria Ortigas",
  "slug":  "rmw-galleria-ortigas-1",   // {source-prefix}-{branch}-{chain id}
  "chain": "Robinsons",                // CinemaChain union, see types/index.ts
  "lat":   14.5901,
  "lng":   121.0578,
  "address":     "EDSA cor. Ortigas Ave., Quezon City",
  "city":        "Quezon City",        // the place-search index groups on this
  "website_url": "https://robinsonsmovieworld.com"
}
```

`lat`/`lng` are required and never guessed — see §3.

### `ScrapedMovie`

```jsonc
{
  "title":            "Spider-Man: Brand New Day",
  "slug":             "rmw-spider-man-brand-new-day-sbnd2d",
  "normalized_title": "SPIDERMANBRANDNEWDAY",   // the cross-chain join key
  "synopsis":     "…",
  "poster_url":   "https://…",
  "rating":       "PG",              // MTRCB
  "duration_mins": 145,
  "category":     "Mainstream",      // Mainstream | Indie | Festival | Special Screening
  "festival_name": null              // "Cinemalaya 2026" when category is Festival
}
```

`slug` is per-source and deliberately collides with nothing. `normalized_title`
is the shared identity: it is how "SPIDER-MAN: BRAND NEW DAY (IMAX)" from one
chain and "Spider-Man: Brand New Day" from another are recognised as one film
by search. See §4.

### `ScrapedShowtime`

```jsonc
{
  "cinema_slug": "rmw-galleria-ortigas-1",
  "movie_slug":  "rmw-spider-man-brand-new-day-sbnd2d",
  "screen_name": "Cinema 1",
  "format":      "Dolby Atmos",              // ScreenFormat union
  "start_time":  "2026-08-05T13:50:00+08:00", // always +08:00, never UTC
  "booking_url": "https://www.etix.com/ticket/e/1059466/…",
  "ticket_price": 350
}
```

The uniqueness key is `(cinema_id, movie_id, start_time, format)`, so re-running
a scrape refreshes prices and links in place instead of doubling the schedule.

### Booking links

`booking_url` is the deepest **addressable** link the source actually has, and
never a fabricated one:

| Source | Depth of link |
| --- | --- |
| SM, Ayala | Per-site checkout on the chain's own booking flow |
| TicketNet | Per-event etix.com checkout — the real ticket page |
| Robinsons | Chain listing page. Its booking URL is an AES-encrypted query string with no stable form |
| Megaworld | Chain home page. Checkout is a WebForms postback with no URL |
| Vista | Schedule page. The session id exists but no GET route accepts it |
| ClickTheCity | Venue listing page. It is an index, not a box office |

A link that 404s is worse than a link one click short of the seat map.

---

## 2. Integration architecture

Nine scrapers, run by `scripts/run-scrapers.ts` on a schedule
(`.github/workflows/scrape.yml`). Each subclasses `BaseScraper` and is
independent: one failing source never stops the others, and its failure is
reported rather than swallowed.

### Fetch strategy per source

**Plain HTTP wins wherever it can.** A headless browser is ~50× the cost of a
fetch and fails in more ways. Only two sources need one.

| Source | Transport | Endpoints |
| --- | --- | --- |
| **SM Cinema** | Playwright for the token, then fetch | Vista Cloud OCAPI — *unchanged, see below* |
| **Ayala** (`ayalaallaccess.com`) | Playwright for the token, then fetch | `/ocapi/v1/sites`, `/films`, `/film-screening-dates`, `/showtimes/by-business-date/{date}` |
| **Robinsons** | fetch | `/webservice/getbranches`, `getmovieswithdetails`, `getmovieswithdetailsbybranch`, `GetScreeningDetailsList`, `getschedulesbybranchandmovie` |
| **Megaworld** | fetch | `POST /GetBranches.aspx`, `POST /GetMovieSchedule.aspx?branch=` |
| **Vista Cinemas** | fetch + cheerio | `/Branches/GetBranchesSlug`, `/Home/MovieSelectorBranches`, `/Home/MovieSelectorMovies`, `/Home/MovieSelectorSchedule` |
| **TicketNet** (Gateway) | fetch + cheerio | `/gateway-cineplex-18-movies`, `/event-detail/{slug}` |
| **ClickTheCity** | fetch | `/api/movies/nearby-malls`, `/api/movies/theater/{slug}?date=` |
| **Microcinemas** | Playwright | WordPress event pages |
| **Festivals** | none — hand-entered | see `festival-screenings.ts` |

> **SM Cinema is not modified.** It shares `vista-cloud.ts` with Ayala because
> both chains run the same platform. The only change to that file is a
> coordinate fallback for sites whose API returns `location: null` — Ayala
> returns null for every site, SM returns real coordinates for every site, so
> SM never reaches that branch and its behaviour is bit-for-bit what it was.

### Ordering, and why the aggregator runs last

`ALL_SCRAPERS` is ordered: chains, then festivals, then ClickTheCity.

ClickTheCity indexes ~144 cinemas nationwide — the only source that covers Power
Plant, Greenhills, Ortigas Estancia, Sta. Lucia East, Bichara SilverScreens in
Legazpi. But it has no booking links. So it contributes:

- **venues, always** — including the chains', because it is the only source with
  coordinates for all of them;
- **showtimes, only where no chain scraper covers the venue**
  (`SUPERSEDED_BY_NATIVE_SCRAPER`, plus `SUPERSEDED_SLUGS` for one-off overlaps
  like Gateway Cineplex 18).

The result is full coverage without the aggregator's linkless rows displacing a
chain's bookable ones.

### House rules the endpoints do not document

Each of these cost a silent zero-row scrape before it was found:

- **Robinsons returns 404 without `X-Requested-With: XMLHttpRequest`.** Not 403,
  not 401 — a plain "resource cannot be found", indistinguishable from a wrong
  URL. It also needs the `SERVER` affinity cookie from any page load first.
- **Robinsons' per-branch catalogue returns an empty `Movie_Code`** for every
  film, while the schedule endpoint keys on that code. The codes come from the
  global catalogue and are matched back by title.
- **Robinsons and Megaworld double-encode**: the body is a JSON *string* whose
  contents are JSON. `httpJson` unwraps one level automatically.
- **Both serialise time as `/Date(1785904200000)/`** — epoch ms, UTC.
- **These hosts answer 411 to a POST with no `Content-Length`.** Sending an
  empty body makes fetch emit `Content-Length: 0`; setting the header by hand
  makes undici throw before the request leaves.
- **Node's fetch ignores `HTTPS_PROXY`.** Behind a filtered egress `curl`
  succeeds and the scraper gets a bot-wall 403 from the same host, which looks
  exactly like a broken scraper. `http.ts` wires up a `ProxyAgent` when the
  variable is set.

### Verifying without a database

```bash
npm run scrape -- --preview --days=7                 # every source
npm run scrape -- --preview --source=robinsons-movieworld
```

`--preview` scrapes for real and prints counts and sample rows, writing nothing.
The alternative is discovering a broken scraper by watching it write zero rows
into production.

---

## 3. Error handling and normalisation

### Missing coordinates: report, never guess

Chains publish branch names, not locations. Ayala's API returns `location: null`
for all 21 of its sites; Robinsons, Megaworld and Vista return no location field
at all. `lib/scrapers/geo.ts` resolves a name against two sources — the
hand-checked `venues.ts` registry first, then ClickTheCity's directory — using a
key with the operator branding stripped:

```ts
venueKey('Robinsons Movieworld Galleria Ortigas'); // 'galleriaortigas'
venueKey('GALLERIA ORTIGAS');                      // 'galleriaortigas'
```

Containment matching is accepted **only when exactly one candidate matches**.
Two candidates means the name is ambiguous, and an ambiguous pin is a wrong pin.

A venue that resolves to nothing is **dropped, and named in `errors`**:

```
[robinsons-movieworld] no coordinates for "PAGADIAN" — add it to lib/scrapers/venues.ts
```

That message is the intended discovery mechanism. Adding the entry is the fix.
Dropping a cinema costs someone a listing; placing it in the wrong city costs
someone a trip.

### Missing showtimes

An empty schedule is a fact, not a failure. Sources distinguish the two:

- A film listed with no `available_schedule` entry costs one request and yields
  nothing — no row, no error.
- A film with a lineup but no published times is recorded as a **movie** with no
  showtimes, and the omission is stated:
  `20 Cinemalaya 2026 titles have no published showtime yet — lineup recorded,
  screenings intentionally omitted until the grid is released.`
- A source that fails outright pushes an error and returns what it has. The
  pipeline ingests the partial result.

The app makes the same distinction: `DataUnavailableError` renders as "Schedule
data unavailable", which is not the same screen as "No screenings in this area".

### Dynamic rendering

Only the Vista Cloud tenants and the WordPress microcinemas need a browser, and
Vista Cloud needs it for one thing: reading `gasToken` out of `__NEXT_DATA__`,
because the web host is behind Cloudflare while the API host is not. Everything
after that is fetch.

The other portals looked JS-rendered and are not — they are jQuery front-ends
over endpoints that answer plain HTTP. Finding those endpoints is what
`scripts/recon.ts` is for, and it is the reason the earlier selector-guessing
version of `vista-cinema.ts` was deleted rather than patched.

### Title normalisation

`BaseScraper.normalizeMovieTitle` collapses a chain's spelling into a join key:

1. Strip format noise — `(IMAX)`, `[3D]`, `Dolby Atmos`, `Director's Club`,
   bracketed anything, `re-release`, `advance screening`, `sub`/`dub`.
2. `NFKD`-normalise and drop combining marks, so `Peñafrancia` and `Penafrancia`
   agree.
3. Uppercase, `&` → `AND`, strip everything that is not `A–Z0–9`.
4. Apply `TITLE_ALIASES` for the handful of cases spelling alone cannot
   reconcile — `DUNE2` and `DUNEPART2` both land on `DUNEPARTTWO`.

```
"Spider-Man: Brand New Day (IMAX)"  →  SPIDERMANBRANDNEWDAY
"SPIDER-MAN BRAND NEW DAY"          →  SPIDERMANBRANDNEWDAY
```

`cleanTitle` runs the same noise-stripping but keeps casing and spacing, and is
what the user sees.

### Format normalisation

`detectFormat` matches an uppercased, punctuation-collapsed haystack built from
whatever the source exposes — screen name, badge text, title — against an
ordered pattern table. Order matters: `IMAX 3D` must be tested before `IMAX`.

Where the format hides varies by source, which is why every call passes several
fragments:

| Source | Where the format is stated |
| --- | --- |
| SM, Ayala | Explicit `attributes` in the API response |
| Vista | The screen name — "Cinema 6 - DOLBY ATMOS" |
| ClickTheCity | The screen name — "Dolby Atmos Cinema 2" |
| Robinsons | A `MovieFormat` field, plus the screen name |
| Megaworld | The screen name |

Unlabelled falls back to `2D`, which is what every chain means when it omits the
label — not a guess, a convention.

### Idempotency

The pipeline dedupes on the showtime conflict key before writing, because
Postgres rejects a batch containing two rows with the same one, and a chain
legitimately produces duplicates — the same film, screen and time under two
attribute combinations. Re-running a scrape is therefore always safe.

---

## 4. Coverage, honestly

Verified live on 2026-08-05 with `--preview --days=7`:

| Source | Venues | Showtimes |
| --- | --- | --- |
| Robinsons Movieworld | 42 | 1,705 |
| ClickTheCity (independents) | 144 indexed | 277 |
| Megaworld | 6 | 122 |
| Vista Cinemas | 7 | 74 |
| TicketNet — Gateway | 1 | 39 |
| SM, Ayala | needs a browser; runs on CI | — |

### Not covered, and why

- **Red Carpet at Shang, Fisher Box Office, Cinema '76** — `redcarpetatshang.com`,
  `fisherboxoffice.com` and `cinema76fs.com` do not resolve in DNS. The domains
  are gone, not blocked. Shang's Red Carpet is reachable through the festival
  entries; the other two have no live source.
- **Gaisano Grand and NCCC** — no online schedule of any kind, and ClickTheCity
  does not index them. Nothing to scrape until one exists.
- **Cinemalaya's per-film grid** — the festival has published its 22-title
  lineup and its opening and closing screenings, and nothing else. The lineup is
  recorded; the times are not invented.

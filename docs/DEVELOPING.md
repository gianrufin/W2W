# Developing W2W

Engineering notes for the app described in [the README](../README.md): how to run
it, how the data gets in, and the decisions worth knowing before changing
something.

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

Supabase is the only data source. There is deliberately **no sample dataset**: a
cinema app that invents screenings is worse than one that admits it has none,
because a wrong showtime sends someone to a cinema for nothing. Until the
scrapers have loaded a schedule the map is empty and says so.

Map tiles follow the theme. With no `NEXT_PUBLIC_MAPTILER_KEY` set they fall back
to keyless raster basemaps — CARTO Positron in light, a darkened OpenStreetMap
raster in dark — so the canvas is never blank.

## Live demo

`.github/workflows/deploy-pages.yml` builds a static export and publishes it to
GitHub Pages on every push to `main` (or on demand from the Actions tab). The
build bakes in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
The anon key is public by design and safe in a client bundle — the tables are
read-only to anon under RLS. The service-role key is never used by the site,
only by the scrape workflow.

The app is exported with `output: 'export'`, which works because it is entirely
client-side: no API routes and no server actions. A project site is served from
a subdirectory, so the workflow passes `NEXT_PUBLIC_BASE_PATH=/<repo>`; local
dev leaves it empty and serves from the root.

To reproduce the Pages build locally:

```bash
NEXT_PUBLIC_BASE_PATH=/W2W npm run build
npx serve out    # or any static server
```

## Install & offline (PWA)

W2W installs to the home screen and opens without a connection.

- `public/manifest.webmanifest` — standalone display, maskable icons, dark theme colour.
- `public/sw.js` — the service worker derives its own scope from where it is served,
  so the same file works at the root in dev and under `/W2W/` on Pages with no
  build-time substitution. Navigations are network-first falling back to the cached
  shell; fingerprinted `_next/static` assets are cache-first; map tiles are
  stale-while-revalidate, capped at 300, so panning over ground you have already
  covered works offline.
- `hooks/use-pwa.ts` registers the worker and captures `beforeinstallprompt`. The
  install banner only renders once the browser has actually fired that event, and
  a dismissal is remembered.

## Location permission

The app opens on the user's surroundings, so the first run has to earn that
permission rather than spring it.

`components/onboarding/location-gate.tsx` explains what the permission buys, then
fires the real browser prompt from a click — browsers only grant a meaningful
dialog off a user gesture, and a cold prompt on first paint is the fastest route to
a permanent block. "Not now" is first-class: the map works from Manila either way.

`hooks/use-geolocation.ts` checks the Permissions API first, so a user who already
granted access is located silently and never sees the gate again.

## Architecture

```
app/                    App Router entry; the page is a thin shell
components/
  discovery-shell.tsx   Wires map + search + filters + results together
  map/                  MapLibre canvas, poster pins, theme-aware style
  navigation/           Floating search bar, rotating wordmark
  filters/              Category / date / format / Festival Focus rail
  ui/                   Cinema cards, format badges, bottom sheet
hooks/
  use-theme.ts          Light/dark toggle; class applied before first paint
  use-discovery.ts      Runs the discovery query; drops stale responses
  use-map-sync.ts       Two-way pin ⇄ card binding
  use-geolocation.ts    Browser position with a Manila fallback
store/                  Zustand: one store for query, results and map state
lib/
  data.ts               Supabase queries; no fallback dataset by design
  scrapers/             Scraper base class, per-chain scrapers, ingest pipeline
supabase/migrations/    Schema + PostGIS RPCs
scripts/                run-scrapers.ts, recon.ts
```

### Database

`supabase/migrations/001_initial_schema.sql` creates `cinemas` (with a
`GEOGRAPHY(Point,4326)` column and a GIST index), `movies`, and `showtimes`, plus
two RPCs:

- **`get_nearby_cinemas_for_movie`** — the single query behind the map. Returns
  venues within a radius, their distance in km, and their upcoming showtimes as
  JSON. Passing `search_movie_id` drops every venue not screening that film,
  which is what makes the movie-first search narrow the map.
- **`search_movies_with_showtimes`** — autocomplete, restricted to films that
  actually have an upcoming screening.

`002_place_search.sql` adds `search_places`, which backs the "travel to an area"
search. Apply both with `supabase db push`, or paste them into the SQL editor.

Reads use the anon key under RLS (all three tables are public-select). Writes go
through the service role from the scraper pipeline.

### Scrapers

`lib/scrapers/base-scraper.ts` holds the parts every chain needs:

- **Title normalization** — `"Spider-Man: Beyond the Spider-Verse (IMAX)"` and
  `"SPIDERMAN BEYOND SPIDERVERSE"` both collapse to the same key, so the same
  film from two chains is one row.
- **Format detection** — an ordered pattern table over title, screen name and
  badge text. `IMAX 3D` must win before `IMAX`; unlabeled screenings fall back
  to `2D`, which is what every chain means by omission.
- **Manila time** — schedules print wall-clock times; everything is emitted as
  `+08:00` ISO.

Implementations: `sm-cinema.ts` (intercepts the schedule XHR rather than parsing
a marketing-driven DOM), `ayala-cinema.ts` (Dolby Atmos / A-Luxe live in a badge
element, not the title), `vista-cinema.ts` (booking deep links are taken
verbatim — they encode a session id), and `microcinemas.ts` (a source table for
indie venues and festivals, since that tier has no API and festival pages vanish
between editions).

`lib/scrapers/pipeline.ts` upserts cinemas and movies on `slug` and showtimes on
`(cinema_id, movie_id, start_time, format)` — the unique constraint from the
migration — so re-running a scrape refreshes prices and links instead of
duplicating the schedule.

```bash
npm run scrape                              # all sources, today + 2 days
npm run scrape -- --source=sm-cinema --days=5
npm run scrape -- --dry-run                 # venues only, no network
npx playwright install chromium             # first run only
```

## Interaction model

Mobile first, and the map owns the viewport on every screen size.

- **One dock, three heights.** `peek` is a single bar so the map is clear for
  navigating — that is the state the app opens in. `list` is the results at
  about half the screen. `venue` is one cinema's schedule. Snap points rather
  than a free drag: a target you can hit with a thumb beats a gesture you have
  to aim.
- **Tapping a pin expands the dock to that venue.** It used to open a separate
  modal above the sheet, which meant two surfaces over the map and two things to
  dismiss. Now there is one, and the back arrow returns to the list you were in.
- **Search covers films and places.** A film narrows the map to venues screening
  it; a city or cinema name moves the map there. That is the case for planning
  around a trip rather than standing on a street.
- **"Search this area"** appears when the map is panned more than ~1.5 km from
  the current results. Panning never refetches on its own: on a phone the map
  moves constantly just from handling the device, and results changing under a
  thumb is disorienting. The radius comes from what is actually on screen, so
  zooming out searches wider, up to nationwide.
- **No pre-filled example in the search field.** Naming a film in the
  placeholder dates the product the moment that film leaves cinemas.

## Design system

Material 3 tonal colour, ported from [SpotMo](https://github.com/gianrufin/spotmo) so
the two apps read as siblings. Every colour is a CSS variable rather than a fixed
hex, so light and dark are the same token set at different tonal values — see the
`:root` / `.dark` blocks in `app/globals.css`.

The hue family stays W2W's own, because these colours carry meaning here:

- **Primary — crimson.** Actions, commercial chains, live showtime indicators.
  Deepened (`#B30710`) in light for contrast on white; vivid (`#FF2A54`) in dark.
- **Tertiary — amber.** Microcinemas, cinematheques and festival venues.
- **Secondary — slate**, and a dedicated **atmos cyan**, used by the format badges
  so IMAX, Director's Club and Dolby Atmos each stay legible in both themes.

**Space Grotesk is the entire typeface system.** Weight does the work a second
family would otherwise do:

- `font-title` — 700, tracking `-0.03em`. Cinema and film names.
- `font-label` — 500. Buttons, chips, section headings.
- body — 400. Everything else.
- `font-numeric` — 500 with tabular figures, so showtimes and distances do not
  jitter as they change.

Also carried over from SpotMo: the Material 3 elevation scale
(`shadow-soft` / `card` / `float` / `fab`) and `ripple` / `slide-up` / `fade-in`
motion.

Map pins are poster-first: the venue's next screening supplies the thumbnail, with
the chain glyph as fallback. The ring colour is the commercial/indie split above.

Theme defaults to dark and is toggleable; the choice persists in `localStorage` and
is applied by an inline script before first paint, so there is no flash.

## Running the scrapers

The scrapers drive a real browser against sites that block datacentre IPs and
render their schedules client-side, so they run on GitHub's runners rather than
anywhere with restricted egress — see `.github/workflows/scrape.yml`, which fires
every six hours and on demand.

Required repository secrets:

| Secret | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Target project (also used by the Pages build) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Read key baked into the deployed site |
| `SUPABASE_SERVICE_ROLE_KEY` | Writes (bypasses RLS). Scrape workflow only |
| `TMDB_API_KEY` | Optional. Fills posters, synopses and runtimes for titles the chains publish without artwork — see `lib/scrapers/tmdb.ts` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Optional, Pages build only. Live and predicted driving times for "leave by". Must be a **new** public token restricted to the site's URL — a default token cannot take restrictions, and restrictions only apply to browser requests |

## Travel time and "leave by"

`lib/travel/` answers one question: what time should someone walk out of the
door. Two providers behind one interface, and the estimate always carries its
own provenance because "live traffic" and "a lookup table" deserve different
amounts of trust.

| Provider | When it is used | Label shown |
| --- | --- | --- |
| `MapboxTrafficProvider` | `NEXT_PUBLIC_MAPBOX_TOKEN` is set and the call succeeds | "live traffic" / "predicted traffic" |
| `ScheduleModelProvider` | always, as the floor | "typical traffic" |

The model is not a placeholder. It is what keeps the feature working with no
token, over quota, or offline: straight-line distance × a 1.4 detour factor ÷ an
average speed for that hour and weekday. It cannot know about an accident on
EDSA; it can know that 6pm Friday is not 6am Sunday, which in Metro Manila is
most of the variance.

Mapbox's `driving-traffic` profile takes `depart_at`, and the returned duration
is a *prediction* from historical and live data — so the estimate for a 9pm
screening is built from 8pm traffic, not from now.

The arithmetic in `leave-by.ts` is trivial; the constants are the feature, and
each is a claim about how Philippine cinemas work rather than a magic number:

```ts
TRAILER_MINUTES = 10        // arriving at the printed time is not late
ARRIVAL_BUFFER_MINUTES = 12 // parking, the walk in, the counter queue
MODEL_MAX_CONFIDENT_MINUTES = 45  // beyond this, the model does not name a minute
```

That last one matters: a confident wrong departure time is worse than none, so a
model estimate over a long drive shows the drive alone.

**Request budget.** One estimate per (origin, destination, departure
quarter-hour), cached ten minutes in `use-travel.ts`. Quantising the departure is
what makes the key hit — two screenings an hour apart need different
predictions, requests made at 6:01 and 6:04 do not. A venue with eight showtimes
makes one call, not eight.

## Verifying venue coordinates

```bash
npm run audit:venues                    # every venue, against OpenStreetMap
npm run audit:venues -- --registry-only
```

The app sorts by distance and tells people when to leave, so a wrong pin is
invisible and expensive: the map looks fine, the number is confident, and the
user drives somewhere there is no cinema.

Two internal sources (the hand registry and the ClickTheCity directory) mostly
agree, but agreement between two never-checked sources is not evidence. The
audit adds a third opinion from OpenStreetMap and separates real errors from
noise by checking whether OSM matched the *named venue* or merely something
nearby — the first run flagged "Robinsons Santiago" as 1006 km out because
Nominatim had found a barangay called Santiago in Pagadian.

Precedence in `geo.ts` is by evidence, not provenance:

1. registry entries marked `verified` — a person checked these
2. the ClickTheCity directory
3. the rest of the registry — typed by hand, unchecked

That order was the other way round until an audit found the unverified registry
entry for Evia Lifestyle Center sitting 4.28 km from the mall, and *winning*.

## Known limits

- The venue registry uses approximate mall centroids, accurate to roughly a
  block, which is the resolution the distance sort needs. Entries carrying
  `verified: true` have been checked; the rest have not.
- Some chains have no addressable checkout URL, so their showtimes link to a
  listing page rather than a seat map. See the booking-link table in
  `docs/DATA-SOURCES.md`.
- Festival source URLs go dark between editions; the pipeline logs those as
  errors and continues rather than failing the run.
- `cinemalaya.org` is behind Cloudflare and needs a browser. Its screenings
  arrive via TicketNet regardless, so the adapter failing costs the lineup
  metadata, not the schedule.

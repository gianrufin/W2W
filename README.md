# W2W — Where, When, What 2 Watch

Real-time cinema discovery for the Philippines. One map for every screening in
the country: the commercial chains (SM, Ayala, Vista, Robinsons, Megaworld,
Fisher, Newport, Shangri-La) and the tier nobody else aggregates — microcinemas,
FDCP cinematheques, and film festivals like Cinemalaya, QCinema and Eiga Sai.

The homepage wordmark rotates **Where / When / What**; **2 Watch** stays.

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

`NEXT_PUBLIC_USE_MOCK_DATA=true` (the default in `.env.example`) runs the entire
UI from `lib/mock-data.ts` — real Philippine venue coordinates, ten films across
all four categories, a full week of showtimes generated relative to today. No
Supabase project needed to see and test the app.

Map tiles follow the theme. With no `NEXT_PUBLIC_MAPTILER_KEY` set they fall back
to keyless raster basemaps — CARTO Positron in light, a darkened OpenStreetMap
raster in dark — so the canvas is never blank.

## Live demo

`.github/workflows/deploy-pages.yml` builds a static export and publishes it to
GitHub Pages on every push to `main` (or on demand from the Actions tab). The
demo runs on the bundled dataset — no Supabase keys are baked into a client
bundle.

The app is exported with `output: 'export'`, which works because it is entirely
client-side: no API routes and no server actions. A project site is served from
a subdirectory, so the workflow passes `NEXT_PUBLIC_BASE_PATH=/<repo>`; local
dev leaves it empty and serves from the root.

To reproduce the Pages build locally:

```bash
NEXT_PUBLIC_BASE_PATH=/W2W NEXT_PUBLIC_USE_MOCK_DATA=true npm run build
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
  data.ts               Supabase-first with automatic mock fallback
  mock-data.ts          The bundled dataset
  scrapers/             Scraper base class, per-chain scrapers, ingest pipeline
supabase/migrations/    Schema + PostGIS RPCs
scripts/                seed-mock-data.ts, run-scrapers.ts
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

Apply it with `supabase db push`, or paste it into the SQL editor.

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

### Seeding a real project

```bash
# .env.local needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run seed
# then set NEXT_PUBLIC_USE_MOCK_DATA=false
```

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

Also carried over from SpotMo: the Material 3 elevation scale
(`shadow-soft` / `card` / `float` / `fab`), squircle radii (`rounded-4xl`,
`rounded-5xl`), Inter at weight 300 as the body default with `font-serif` mapping to
it for headings, and `ripple` / `slide-up` / `fade-in` motion.

`font-title` is the one deliberate exception — **Instrument Serif, reserved for
movie titles only**, the same way SpotMo reserves it for event titles.

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
| `NEXT_PUBLIC_SUPABASE_URL` | Target project |
| `SUPABASE_SERVICE_ROLE_KEY` | Writes (bypasses RLS) |
| `TMDB_API_KEY` | Optional. Fills posters, synopses and runtimes for titles the chains publish without artwork — see `lib/scrapers/tmdb.ts` |

## Known limits

- **The scrapers have never been run against the live sites.** They were written
  against published page structures, and the selectors will need adjustment on
  first real run. The parse step in each is deliberately isolated from the
  transport so that is a contained change.
- SM Cinema sits behind Cloudflare bot protection and Ayala's sureseats.com did
  not resolve at all from the development environment. Both may need a residential
  egress path, a longer settle, or an official data agreement rather than scraping.
- The venue registry in `lib/scrapers/venues.ts` uses approximate mall centroids
  (accurate to roughly a block), which is the resolution the distance sort needs.
- Festival source URLs go dark between editions; the pipeline logs those as
  errors and continues rather than failing the run.

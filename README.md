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

Map tiles fall back to a darkened OpenStreetMap raster style when no
`NEXT_PUBLIC_MAPTILER_KEY` is set, so the canvas is never blank.

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

## Architecture

```
app/                    App Router entry; the page is a thin shell
components/
  discovery-shell.tsx   Wires map + search + filters + results together
  map/                  MapLibre canvas, squircle pins, dark style resolution
  navigation/           Floating search bar, rotating wordmark
  filters/              Category / date / format / Festival Focus rail
  ui/                   Cinema cards, format badges, bottom sheet
hooks/
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

Ultra-dark zinc canvas (`#09090b`), squircle geometry throughout (`rounded-2xl`
/ `rounded-3xl`), floating glassmorphic panels (`backdrop-blur-xl
bg-zinc-950/80`), and spring-physics motion via Framer Motion.

Colour carries meaning rather than decoration:

- **Crimson** (`#E50914` → `#FF2A54`) — commercial chains, primary actions, live
  showtime indicators.
- **Amber** (`#F59E0B`) — microcinemas, cinematheques and festival venues.
- **Metallic badges** — brushed slate for IMAX, gold gloss for Director's Club /
  VIP / A-Luxe, cyan for Dolby Atmos. Everything else stays on the neutral chip
  so the premium tiers actually read as premium.

## Known limits

- Selectors in the Ayala, Vista and microcinema scrapers are written against the
  published page structures and will need adjustment against live markup; the
  parse step in each is isolated from the transport for exactly that reason.
- The venue registry in `lib/scrapers/venues.ts` uses approximate mall centroids
  (accurate to roughly a block), which is the resolution the distance sort needs.
- Festival source URLs go dark between editions; the pipeline logs those as
  errors and continues rather than failing the run.

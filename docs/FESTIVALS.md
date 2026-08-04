# Film festivals & special screenings

The second data pipeline: Cinemalaya, QCinema, the FDCP cinematheques, the CCP
and the ticketing portals that sell them.

Companion to [`DATA-SOURCES.md`](DATA-SOURCES.md), which covers the commercial
chains. Code lives in `lib/festivals/`.

---

## Why this is a separate service

The chain pipeline is live and SM depends on it. So nothing here shares a
process, a schedule or a code path with it:

| | Chains | Festivals |
| --- | --- | --- |
| Code | `lib/scrapers/` | `lib/festivals/` |
| Runner | `npm run scrape` | `npm run festivals` |
| Workflow | `scrape.yml`, every 6h | `festivals.yml`, twice daily |
| Writes | `showtimes` with `festival_id = null` | `showtimes` with `festival_id` set |

**SM Cinema is untouched by any of this.** No file under `lib/scrapers/` was
modified for the festival module, and every festival write is scoped by
`festival_id` — the SQL that archives finished festivals filters on it
explicitly, so a chain showtime is not reachable from here even by accident.

The two meet only in the database, through the additive columns in
`004_festivals.sql`. That is what lets one map show a Cinemalaya short and a
Spider-Man screening side by side without the app knowing there were two
pipelines behind it.

---

## 1. The data model

### `FestivalEvent` — the unit

The unit is the **screening**, not the film. A festival title plays three times
across two venues, once with the director present and once online, and each of
those is a different decision for the person choosing.

```jsonc
{
  "festival_slug": "cinemalaya",       // stable across editions
  "edition_year": 2026,

  "film_title": "Ang Duyan ng Magiting",
  "director": "Dwein Baltazar",
  "country": "Philippines",
  "year_produced": 2026,
  "section": "Gala",                   // Feature | Shorts | Gala | Competition
                                       // | Retrospective | Talkback
                                       // | Masterclass | Special Screening
  "venue_name": "GATEWAY 11",          // the festival's own spelling
  "screen_name": "Cinema 11",
  "showtime": "2026-08-07T18:00:00+08:00",   // always +08:00

  "talkback_flag": true,               // a Q&A follows
  "is_online_screening": false,        // streamed, not projected
  "ticket_url": "https://www.etix.com/ticket/e/1060196/…",
  "ticket_portal": "etix",             // etix | ktx | venue-box-office | …
  "admission": "Free"                  // as published
}
```

`venue_name` is deliberately raw. Adapters never resolve a venue themselves —
carrying the festival's own string through is what lets the mapping be corrected
in one place instead of five.

### `FestivalEdition` — the season

```jsonc
{
  "slug": "cinemalaya",
  "name": "Cinemalaya 22",
  "edition_year": 2026,
  "cadence": "annual",                 // annual | seasonal | continuous
  "screening_start_date": "2026-08-06",
  "screening_end_date": "2026-08-18",
  "official_url": "https://www.cinemalaya.org",
  "ticket_url": "https://www.ticketnet.com.ph/gateway-cineplex-18-movies"
}
```

Dates are nullable because an edition is routinely announced months before its
dates are. Recording "Cinemalaya 23 exists" is useful even then.

`cadence` drives archiving. The cinematheques are `continuous` — they programme
year-round and have no season to be outside of, so they are never archived on a
festival-ended rule.

### Where it lands

- `festivals` — one row per edition, unique on `(slug, edition_year)`
- `movies` — gains `festival_id`, `director`, `section`, `country`,
  `year_produced`
- `showtimes` — gains `festival_id`, `talkback`, `is_online_screening`,
  `ticket_portal`, `admission`
- `festival_venue_aliases` — the mapping layer, see §3

Festival films are `movies` rows rather than a parallel table because a festival
title *is* a film: it needs the same search, the same poster, the same
normalized-title reconciliation. Splitting them would mean every query in the
app had to know about two kinds of film.

---

## 2. The adapter pattern

Every source publishes its programme differently, and none of them will still be
shaped that way in two years. So `FestivalAdapter` is the boundary: `fetch()` is
whatever that site needs this season, and everything downstream sees the same
`FestivalEvent`.

An adapter does three things and no more: read its source, emit events with the
venue named the way the festival names it, and say what went wrong. It never
resolves venues, never writes to the database, and never decides whether a
festival is active.

```ts
export class QCinemaAdapter extends FestivalAdapter {
  readonly source = 'qcinema';
  readonly label = 'QCinema International Film Festival';

  async fetch(options: FestivalScrapeOptions = {}): Promise<FestivalScrapeResult> {
    // …whatever this site needs
  }
}
```

### The sources, and what each one actually is

| Adapter | Transport | What it gives |
| --- | --- | --- |
| **qcinema** | fetch + cheerio | 186 screenings, 9 venues, with gala/talkback flags |
| **ticketnet-festivals** | fetch + cheerio | 240 Cinemalaya screenings with real etix checkout links |
| **fdcp-cinematheque** | fetch + regex | 17 cinematheque screenings, all free admission |
| **ccp** | fetch (WP REST) | Festival editions and their date windows |
| **cinemalaya** | Playwright | Edition and window from the official site |

**QCinema** is a WordPress page built with Themify. Heading levels carry the
hierarchy, so the parser is a state machine over headings and paragraphs in
document order:

```
<h2>11/15 Saturday</h2>            ← date
<h3>GATEWAY 11</h3>                ← venue
<p>6:00p [GALA + TALKBACK]<br>Diamonds in the Sand</p>
```

Nothing is keyed to CSS classes: Themify generates them per block (`tb_j2fc523`)
and they change on every edit, so a class-based selector would break the first
time the programme is updated.

**FDCP** looks like a JavaScript app — pick a location, watch a spinner. It is
not. The entire schedule is inlined as `const CC_SCHEDULE = [...]` and the
"loading" is the browser filtering an array it already has. One request, no
browser, no per-location round trips.

**TicketNet** is the only source with Cinemalaya's actual screenings. It writes
festival runs as ranges, which is why it needs its own adapter separate from the
chain scraper:

```
CINEMALAYA 2026 SHORTS SET A: August 7 - August 18, 2026 | 09:00 PM
  CINEMA 16 - 12:00 PM | 3:00 PM | 6:00 PM
  CINEMA 12 - 12:00 PM | 3:00 PM | 6:00 PM
```

One row, twelve days, four screens, three times each — expanded into 240
screenings.

**CCP** runs The Events Calendar, whose REST API is public. It publishes an
event ("CINEMALAYA 22 … 2026", 6–18 August) rather than a grid, so its job is
establishing **date windows** — which is exactly what the lifecycle needs and
what nothing else reliably provides.

**Cinemalaya's own site** answers 403 to plain HTTP: Cloudflare's check is on
the TLS handshake, so no combination of headers gets past it. A browser is the
only way in. It is also the least important source for Cinemalaya — the
screenings come from TicketNet — so its failure is reported and the run
continues.

### Sources that do not exist

Stated because "we tried and there is nothing there" is a finding:

- **`cinema76fs.com`, `sinepop.ph`, `ktx.ph`** — no DNS. The domains are gone,
  not blocked.
- **`filminstitute.upd.edu.ph`** — HTTP 500. The UP Film Institute's site is
  down, not merely unscrapeable.
- **MMFF** — runs 25 December to early January. There is nothing to scrape in
  August; the adapter list has a slot for it and TicketNet already recognises
  the name.

### Adding one

1. Subclass `FestivalAdapter` in `lib/festivals/adapters/`.
2. Emit `FestivalEvent`s. Use the festival's own venue spelling.
3. Register it in `ALL_FESTIVAL_ADAPTERS` — window sources before screening
   sources, so screenings attach to an edition whose dates are already known.
4. Verify before trusting it: `npm run festivals -- --preview --source=<id>`.

---

## 3. Venue normalisation

This is the layer the module turns on. A screening whose venue cannot be placed
cannot appear on a map, and festivals name venues the way an audience says them:

```
GATEWAY 11          → Gateway Cineplex 18, screen 11
TRINOMA 3           → Trinoma Cinemas, screen 3
Cinematheque Manila → FDCP Cinematheque Manila
```

Note the first two: a festival's "venue" is usually a *screen* inside a venue we
already have. Splitting the trailing number off is most of the work.

`FestivalVenueMap.resolve()` tries both readings of the string — whole, and with
a trailing screen number split off — but **certainty comes before completeness**:
every exact match is tried before any fuzzy one.

That ordering is load-bearing, and it was a real bug before it was a rule. Once
normalised, `GATEWAY 11` *contains* `Gateway Mall`, so a naive whole-string-first
pass resolved it to the wrong building and silently dropped the screen number —
which would have pointed the booking link at a box office that does not sell
that seat. Exact-first means a genuine venue whose name ends in a digit
("Gateway Mall 2") still wins on its own name, while "GATEWAY 11" falls through
to the split.

Fuzzy containment is accepted **only when exactly one branch matches**. Two
candidates means the string is ambiguous, and an ambiguous pin is a wrong pin.
"GALLERIA 3" matches both Robinsons Galleria Ortigas and Galleria Cebu, so it is
refused — and then resolved by an alias that says which one QCinema means.

Anything surviving all passes is **reported, not guessed**:

```
? unmapped venue "SINE POP" — add it to festival_venue_aliases
```

That list is the queue of aliases to add. `festival_venue_aliases` is a table
rather than a constant in code because it grows every festival season, and being
able to correct a wrong pin with an INSERT rather than a deploy matters.
`005_festival_venue_aliases.sql` seeds the mappings verified from live data.

Current state, measured against every venue the live adapters emit:
**11 of 11 venues resolve, 443 of 443 screenings place.**

---

## 4. Seasonal lifecycle

Festival data is temporary, which is the thing that makes it different from a
cinema schedule. A chain's showtimes are simply pruned once they pass. A
festival's *programme* stays interesting after it ends — what played, where —
while its screenings must stop appearing.

### `is_active` is derived, never set

```sql
select refresh_festival_activity();
```

Recomputes every edition's flag from its date window, in Manila time. Deriving
it rather than storing a decision means a festival cannot get stuck live because
the run meant to close it never happened. `continuous` cadence is always active.

This runs on every ingest and on every archive pass.

### Archiving

```sql
select archive_past_festival_screenings(grace_days => 2);
```

Deletes the **screenings** of editions that ended more than `grace_days` ago and
leaves the festival and its films in place. What played at Cinemalaya 22 stays
answerable; when it played stops cluttering a map of tonight.

The `festival_id` filter is what keeps this strictly inside the festival
pipeline's own data — verified with a 400-day-old chain showtime sitting in the
same table, which the archive pass leaves alone.

### Reading it back

```sql
select * from get_active_festivals(horizon_days => 30);
```

Returns editions running or about to, with live screening and venue counts — so
the Festival Focus rail can hide an edition whose programme has not been
published yet rather than offering an empty filter.

---

## 5. Running it

```bash
npm run festivals                          # every adapter, then the lifecycle pass
npm run festivals -- --source=qcinema
npm run festivals -- --preview             # fetch, print, write nothing
npm run festivals -- --archive-only        # just the lifecycle pass
npm run festivals -- --horizon=365
```

`--preview` needs no database credentials. Use it before trusting a change: the
alternative is finding out an adapter is broken by watching it write zero rows
into production.

Migrations, in order: `003_cinema_chains.sql`, `004_festivals.sql`,
`005_festival_venue_aliases.sql`. All three have been executed against a real
PostgreSQL 16 + PostGIS instance, not merely written.

<div align="center">

# W2W

**Where · When · What 2 Watch**

Every film screening in the Philippines, on one map.

[Open the app →](https://gianrufin.github.io/W2W/)

</div>

---

## What it is

W2W answers one question: *what can I actually watch, near me, right now?*

Open it and you get a live map of the cinemas around you, each pin showing how
many screenings it has today. Tap one and you see what is playing, at what time,
in what format, and a link straight to the official booking page. No feed, no
reviews, no trailers — the schedule and the way to a ticket.

It covers the whole country, not just the malls: SM, Ayala, Robinsons,
Megaworld and Vista alongside Power Plant, Greenhills, the FDCP cinematheques,
the microcinemas and the film festivals that no other listing site aggregates.
Two hundred venues from Angeles to Tagum, on one map.

## What you can do with it

**Find what's on near you.** The map opens on your surroundings and sorts
cinemas by how far away they actually are. Location is asked for once, with an
explanation, and "not now" is a real answer — the map works from Manila either
way.

**Look somewhere you aren't yet.** Flying to Cebu on Friday? Search the city and
the map goes there. Pan anywhere in the country and a **Search this area**
button appears, so you can plan around a trip instead of only around where you
are standing.

**Search by film.** Type a title and the map drops every venue that isn't
showing it. What's left is where you can see it, nearest first.

**Filter to the screening you want.** IMAX, Dolby Atmos, Director's Club, 4DX,
A-Luxe, ScreenX — the formats come from the cinemas' own data, not guessed from
a film's title. Pick a date up to a week out.

**Find the festivals.** Cinemalaya, QCinema and the FDCP cinematheques are
first-class, marked in violet against the chains' gold, with a Festival Focus
filter that isolates them — down to which screenings have a director's talkback
afterwards and which are free.

**Know when to leave.** Open a cinema and W2W works backwards from the
showtime — through the drive, the parking, and the ten minutes of trailers you
are allowed to miss — to tell you what time to walk out of the door. With a
traffic key it uses predicted conditions for when you would actually be
driving; without one it falls back to typical speeds for that hour and says so.

**Keep it on your phone.** W2W installs to the home screen and opens offline,
including the part of the map you have already looked at.

## What's in it today

Showtimes are refreshed every six hours, straight from the cinemas' own booking
systems rather than scraped from a listings page.

| Source | Status |
| --- | --- |
| **SM Cinema** | Live — every branch nationwide |
| **Ayala Malls Cinemas** | Live — every branch, including the ones its own booking system can't place |
| **Robinsons Movieworld** | Live — all 42 branches, Luzon to Mindanao |
| **Megaworld Lifestyle** | Live — Uptown, Eastwood, Venice, Newport, Lucky Chinatown, Festive Walk Iloilo |
| **Vista Cinemas** | Live — every branch with a schedule |
| **Gateway Cineplex 18** | Live, with real ticket links |
| **Everything else** | 144 venues indexed nationwide — Power Plant, Greenhills, Ortigas Estancia, Sta. Lucia East, Bichara SilverScreens in Legazpi |
| **Cinemalaya 2026** | Live — the full Gateway run, with real ticket links |
| **QCinema, FDCP cinematheques, CCP** | Live — full programmes, with talkback and free-admission flags |

**W2W never invents a screening.** There is no sample data behind it. If a
cinema's schedule has not loaded, the app says so rather than showing something
plausible — a wrong showtime sends someone across a city for nothing, which is
worse than an empty map.

## How it looks

A dark cinematic surface by default, with a light theme a tap away. Colour
carries meaning rather than decoration: **amber-gold** for the commercial chains,
**violet** — its complement — for indie venues and festivals, and metallic badges that let IMAX,
Dolby Atmos and the premium tiers read at a glance.

Set in **Space Grotesk** throughout, with weight doing the work a second
typeface usually would — heavy and tight for titles, medium for controls, and
tabular figures for showtimes so the numbers stay steady as they change.

Mobile first: the map owns the screen. The dock sits at the bottom as a single
bar so nothing covers the map while you navigate — tap it for the list, tap a
cinema for its schedule.

## Known gaps

- Some venues link to a chain's listing page rather than straight to a seat map,
  because that chain has no addressable checkout URL to link to.
- Gaisano Grand and NCCC in the Visayas and Mindanao publish no schedule online
  at all, so W2W has nothing to show for them.
- Some posters are missing where a chain publishes a film without artwork.
- Venue pins are mall centroids accurate to about a block. Every venue is
  cross-checked against OpenStreetMap; the ones that agree are marked as
  verified, and the audit that finds the rest is a command anyone can re-run.

## Built with

Next.js and TypeScript, MapLibre for the map, Supabase with PostGIS for the
geospatial queries, and Playwright for the workers that collect the schedules.

Engineering detail and setup live in [`docs/DEVELOPING.md`](docs/DEVELOPING.md).
Where each chain's schedule comes from is in
[`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md); the festival and cinematheque
pipeline is in [`docs/FESTIVALS.md`](docs/FESTIVALS.md).

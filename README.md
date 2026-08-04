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

It covers the whole country, not just the malls: SM and Ayala alongside the
microcinemas, FDCP cinematheques and film festivals that no other listing site
aggregates.

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

**Find the festivals.** Cinemalaya, QCinema and the cinematheque circuit are
first-class, marked in amber against the chains' crimson, with a Festival Focus
filter that isolates them.

**Keep it on your phone.** W2W installs to the home screen and opens offline,
including the part of the map you have already looked at.

## What's in it today

Showtimes are refreshed every six hours, straight from the cinemas' own booking
systems rather than scraped from a listings page.

| Source | Status |
| --- | --- |
| **SM Cinema** | Live — every branch nationwide, with the chain's own coordinates |
| **Ayala Malls Cinemas** | Live for the branches we can place on the map |
| **Cinemalaya 2026** | Full 22-title lineup; opening and closing screenings have times |
| **Robinsons, Vista, microcinemas** | Venues mapped, schedules not yet flowing |

**W2W never invents a screening.** There is no sample data behind it. If a
cinema's schedule has not loaded, the app says so rather than showing something
plausible — a wrong showtime sends someone across a city for nothing, which is
worse than an empty map.

## How it looks

A dark cinematic surface by default, with a light theme a tap away. Colour
carries meaning rather than decoration: **crimson** for the commercial chains,
**amber** for indie venues and festivals, and metallic badges that let IMAX,
Dolby Atmos and the premium tiers read at a glance.

Set in **Space Grotesk** throughout, with weight doing the work a second
typeface usually would — heavy and tight for titles, medium for controls, and
tabular figures for showtimes so the numbers stay steady as they change.

Mobile first: the map owns the screen, and the schedule lives in a sheet that
slides up when you tap a cinema.

## Known gaps

- Robinsons, Vista and the microcinema venues appear on the map but have no
  schedules loaded yet.
- 17 Ayala branches are absent because their booking system returns no
  coordinates for them, and a pin in the wrong place is worse than no pin.
- Cinemalaya's per-film grid has not been published; only the opening and
  closing screenings have confirmed times.
- Some posters are missing where a chain publishes a film without artwork.

## Built with

Next.js and TypeScript, MapLibre for the map, Supabase with PostGIS for the
geospatial queries, and Playwright for the workers that collect the schedules.

Engineering detail, setup and data-pipeline notes live in
[`docs/DEVELOPING.md`](docs/DEVELOPING.md).

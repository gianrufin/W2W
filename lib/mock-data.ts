import type { Cinema, Movie, ScreenFormat, Showtime, CinemaWithShowtimes } from '@/types';
import { ALL_VENUES } from '@/lib/scrapers/venues';
import { haversineKm, manilaDateKey } from '@/lib/utils';

/**
 * Mock dataset.
 *
 * Drives the whole UI with no Supabase project attached, so the map, the
 * carousel and every filter can be exercised before a single scraper runs.
 * Showtimes are generated relative to *today* so the "starting soon" and
 * "already started" states are always reachable.
 */

export const MOCK_CINEMAS: Cinema[] = ALL_VENUES.map((v) => ({
  id: `cinema-${v.slug}`,
  name: v.name,
  slug: v.slug,
  chain: v.chain,
  lat: v.lat,
  lng: v.lng,
  address: v.address,
  city: v.city,
  website_url: v.website_url ?? null,
  logo_url: null,
}));

interface MockMovieSeed {
  title: string;
  slug: string;
  synopsis: string;
  rating: string;
  duration_mins: number;
  category: Movie['category'];
  festival_name?: string;
  genres: string[];
  poster_hue: number;
  /** Venue slugs this film plays at, with the formats offered there. */
  playsAt: Array<{ venue: string; formats: ScreenFormat[]; screen?: string; price?: number }>;
  /** Manila wall-clock start times, spread across the day. */
  times: string[];
}

const MOVIE_SEEDS: MockMovieSeed[] = [
  {
    title: 'Dune: Part Two',
    slug: 'dune-part-two',
    synopsis:
      'Paul Atreides unites with the Fremen to wage war against the House Harkonnen, torn between the love of his life and the fate of the universe.',
    rating: 'PG',
    duration_mins: 166,
    category: 'Mainstream',
    genres: ['Sci-Fi', 'Adventure'],
    poster_hue: 32,
    playsAt: [
      { venue: 'sm-megamall', formats: ['IMAX', '2D'], screen: 'IMAX Theatre', price: 520 },
      { venue: 'sm-mall-of-asia', formats: ['IMAX 3D', "Director's Club"], screen: 'Cinema 1', price: 620 },
      { venue: 'sm-aura', formats: ['2D', 'Dolby Atmos'], screen: 'Atmos Hall', price: 480 },
      { venue: 'glorietta-4', formats: ['Dolby Atmos', '2D'], screen: 'Cinema 3', price: 450 },
      { venue: 'ayala-manila-bay', formats: ['A-Luxe', '2D'], screen: 'A-Luxe 1', price: 700 },
      { venue: 'trinoma', formats: ['2D'], screen: 'Cinema 4', price: 380 },
      { venue: 'uptown-bgc', formats: ['2D', 'VIP'], screen: 'Screen 5', price: 550 },
      { venue: 'sm-city-cebu', formats: ['2D'], screen: 'Cinema 2', price: 350 },
    ],
    times: ['10:30 AM', '1:45 PM', '4:50 PM', '8:00 PM', '11:10 PM'],
  },
  {
    title: 'Spider-Man: Beyond the Spider-Verse',
    slug: 'spider-man-beyond-the-spider-verse',
    synopsis:
      'Miles Morales races across the multiverse to rewrite the fate that every other Spider-Person insists is canon.',
    rating: 'PG',
    duration_mins: 140,
    category: 'Mainstream',
    genres: ['Animation', 'Action'],
    poster_hue: 348,
    playsAt: [
      { venue: 'sm-north-edsa', formats: ['IMAX 3D', '2D'], screen: 'IMAX', price: 560 },
      { venue: 'sm-megamall', formats: ['3D', '2D'], screen: 'Cinema 6', price: 420 },
      { venue: 'greenbelt-3', formats: ['2D', 'Dolby Atmos'], screen: 'Cinema 2', price: 460 },
      { venue: 'robinsons-galleria', formats: ['2D'], screen: 'Cinema 3', price: 340 },
      { venue: 'starmall-alabang', formats: ['2D'], screen: 'Cinema 1', price: 300 },
      { venue: 'fisher-mall-quezon-ave', formats: ['2D'], screen: 'Cinema 2', price: 290 },
      { venue: 'newport-cinemas', formats: ['4DX', '2D'], screen: '4DX Hall', price: 780 },
    ],
    times: ['11:15 AM', '2:20 PM', '5:25 PM', '8:30 PM'],
  },
  {
    title: 'Mission: Impossible 8',
    slug: 'mission-impossible-8',
    synopsis:
      'Ethan Hunt has one last impossible run, and this time the countdown is measured in continents.',
    rating: 'PG',
    duration_mins: 158,
    category: 'Mainstream',
    genres: ['Action', 'Thriller'],
    poster_hue: 205,
    playsAt: [
      { venue: 'sm-aura', formats: ['IMAX', '2D'], screen: 'IMAX with Laser', price: 540 },
      { venue: 'sm-mall-of-asia', formats: ['2D', 'ScreenX'], screen: 'ScreenX', price: 500 },
      { venue: 'ayala-center-cebu', formats: ['2D'], screen: 'Cinema 4', price: 330 },
      { venue: 'uptown-bgc', formats: ['Dolby Atmos', '2D'], screen: 'Atmos 2', price: 470 },
      { venue: 'shangri-la-cineplex', formats: ['2D'], screen: 'Cinema 2', price: 420 },
      { venue: 'evia-lifestyle-center', formats: ['2D'], screen: 'Cinema 3', price: 290 },
    ],
    times: ['12:00 PM', '3:10 PM', '6:20 PM', '9:30 PM'],
  },
  {
    title: 'Hindi Ako Nagtatampo',
    slug: 'hindi-ako-nagtatampo',
    synopsis:
      'A Manila nurse working nights discovers her late mother kept a second family two streets away.',
    rating: 'R-13',
    duration_mins: 104,
    category: 'Festival',
    festival_name: 'Cinemalaya 2026',
    genres: ['Drama'],
    poster_hue: 42,
    playsAt: [
      { venue: 'ccp-tanghalang-manuel-conde', formats: ['2D'], screen: 'Tanghalang Manuel Conde', price: 250 },
      { venue: 'gateway-cineplex', formats: ['2D'], screen: 'Cinema 5', price: 250 },
      { venue: 'up-cine-adarna', formats: ['2D'], screen: 'Cine Adarna', price: 200 },
      { venue: 'red-carpet-shangri-la', formats: ['2D'], screen: 'Red Carpet', price: 300 },
    ],
    times: ['1:00 PM', '4:00 PM', '7:00 PM'],
  },
  {
    title: 'Ang Huling Biyahe sa Baler',
    slug: 'ang-huling-biyahe-sa-baler',
    synopsis:
      'Two estranged brothers drive their father’s jeepney one final time, from Cubao to the Aurora coast.',
    rating: 'PG',
    duration_mins: 118,
    category: 'Festival',
    festival_name: 'Cinemalaya 2026',
    genres: ['Drama', 'Road Movie'],
    poster_hue: 18,
    playsAt: [
      { venue: 'ccp-tanghalang-manuel-conde', formats: ['2D'], screen: 'Tanghalang Manuel Conde', price: 250 },
      { venue: 'gateway-cineplex', formats: ['2D'], screen: 'Cinema 6', price: 250 },
      { venue: 'cinematheque-manila', formats: ['2D'], screen: 'Main Hall', price: 150 },
    ],
    times: ['11:30 AM', '2:30 PM', '5:30 PM', '8:30 PM'],
  },
  {
    title: 'Salvage Season',
    slug: 'salvage-season',
    synopsis:
      'A documentary crew embeds with the divers who strip sunken ships off the Visayan coast.',
    rating: 'R-13',
    duration_mins: 96,
    category: 'Festival',
    festival_name: 'QCinema 2026',
    genres: ['Documentary'],
    poster_hue: 190,
    playsAt: [
      { venue: 'gateway-cineplex', formats: ['2D'], screen: 'Cinema 2', price: 250 },
      { venue: 'trinoma', formats: ['2D'], screen: 'Cinema 7', price: 280 },
      { venue: 'red-carpet-shangri-la', formats: ['2D'], screen: 'Red Carpet', price: 300 },
    ],
    times: ['12:30 PM', '3:30 PM', '6:30 PM'],
  },
  {
    title: 'Perfect Days',
    slug: 'perfect-days',
    synopsis:
      'A Tokyo toilet cleaner finds a quiet grace in routine, cassette tapes and the light through leaves.',
    rating: 'PG',
    duration_mins: 124,
    category: 'Festival',
    festival_name: 'Eiga Sai 2026',
    genres: ['Drama'],
    poster_hue: 140,
    playsAt: [
      { venue: 'red-carpet-shangri-la', formats: ['2D'], screen: 'Red Carpet', price: 0 },
      { venue: 'cinematheque-manila', formats: ['2D'], screen: 'Main Hall', price: 0 },
      { venue: 'up-cine-adarna', formats: ['2D'], screen: 'Cine Adarna', price: 0 },
      { venue: 'cinematheque-davao', formats: ['2D'], screen: 'Main Hall', price: 0 },
    ],
    times: ['2:00 PM', '5:00 PM', '8:00 PM'],
  },
  {
    title: 'Kalawakan',
    slug: 'kalawakan',
    synopsis:
      'A radio astronomer in Bataan starts receiving a signal that answers in her mother’s voice.',
    rating: 'PG',
    duration_mins: 88,
    category: 'Indie',
    genres: ['Sci-Fi', 'Drama'],
    poster_hue: 268,
    playsAt: [
      { venue: 'cinema-76-san-juan', formats: ['2D'], screen: 'Main', price: 200 },
      { venue: 'cinema-centenario', formats: ['2D'], screen: 'Main', price: 200 },
      { venue: 'cinematheque-iloilo', formats: ['2D'], screen: 'Main Hall', price: 150 },
      { venue: 'cinematheque-negros', formats: ['2D'], screen: 'Main Hall', price: 150 },
    ],
    times: ['3:00 PM', '6:00 PM', '9:00 PM'],
  },
  {
    title: 'Tricycle Diaries',
    slug: 'tricycle-diaries',
    synopsis:
      'Shot over four years on a single Antipolo route, an ensemble portrait of the passengers who keep returning.',
    rating: 'PG',
    duration_mins: 92,
    category: 'Indie',
    genres: ['Documentary', 'Slice of Life'],
    poster_hue: 88,
    playsAt: [
      { venue: 'cinema-centenario', formats: ['2D'], screen: 'Main', price: 200 },
      { venue: 'cinema-76-san-juan', formats: ['2D'], screen: 'Main', price: 200 },
      { venue: 'cinematheque-nabunturan', formats: ['2D'], screen: 'Main Hall', price: 100 },
    ],
    times: ['4:30 PM', '7:30 PM'],
  },
  {
    title: 'Le Grand Bleu — 40th Anniversary',
    slug: 'le-grand-bleu-40th',
    synopsis:
      'Luc Besson’s free-diving epic returns in a restored print for one week only.',
    rating: 'PG',
    duration_mins: 168,
    category: 'Special Screening',
    festival_name: 'French Film Festival 2026',
    genres: ['Drama', 'Classic'],
    poster_hue: 210,
    playsAt: [
      { venue: 'greenbelt-3', formats: ['2D'], screen: 'Cinema 1', price: 350 },
      { venue: 'cinematheque-manila', formats: ['2D'], screen: 'Main Hall', price: 150 },
      { venue: 'red-carpet-shangri-la', formats: ['2D'], screen: 'Red Carpet', price: 300 },
    ],
    times: ['5:00 PM', '8:15 PM'],
  },
];

/** Deterministic gradient poster so the UI has art without shipping binaries. */
function posterFor(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="hsl(${hue} 70% 42%)"/>
<stop offset="55%" stop-color="hsl(${(hue + 24) % 360} 55% 18%)"/>
<stop offset="100%" stop-color="hsl(${(hue + 300) % 360} 45% 8%)"/>
</linearGradient></defs>
<rect width="300" height="450" fill="url(#g)"/>
<circle cx="230" cy="90" r="120" fill="hsl(${hue} 90% 60%)" opacity="0.18"/>
<circle cx="60" cy="380" r="140" fill="hsl(${(hue + 180) % 360} 90% 60%)" opacity="0.12"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function normalize(title: string): string {
  return title.toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]/g, '');
}

export const MOCK_MOVIES: Movie[] = MOVIE_SEEDS.map((seed, i) => ({
  id: `movie-${seed.slug}`,
  title: seed.title,
  slug: seed.slug,
  normalized_title: normalize(seed.title),
  synopsis: seed.synopsis,
  poster_url: posterFor(seed.poster_hue),
  backdrop_url: null,
  rating: seed.rating,
  duration_mins: seed.duration_mins,
  category: seed.category,
  festival_name: seed.festival_name ?? null,
  release_date: null,
  genres: seed.genres,
  // Keeps ordering stable across renders.
  ...(i === -1 ? {} : {}),
}));

/** Showtimes for the next 7 Manila days, generated from the seed table. */
export const MOCK_SHOWTIMES: Array<Showtime & { cinema_id: string }> = (() => {
  const rows: Array<Showtime & { cinema_id: string }> = [];
  const days = Array.from({ length: 7 }, (_, i) =>
    manilaDateKey(new Date(Date.now() + i * 86_400_000)),
  );

  for (const seed of MOVIE_SEEDS) {
    const movie = MOCK_MOVIES.find((m) => m.slug === seed.slug)!;

    for (const dayIndex of days.keys()) {
      const day = days[dayIndex];

      for (const venue of seed.playsAt) {
        const cinema = MOCK_CINEMAS.find((c) => c.slug === venue.venue);
        if (!cinema) continue;

        seed.times.forEach((time, timeIndex) => {
          // Indie venues do not run every slot every day — thin them out so the
          // schedule reads like a real week rather than a grid.
          if (seed.category !== 'Mainstream' && (timeIndex + dayIndex) % 2 === 1) return;

          const format = venue.formats[timeIndex % venue.formats.length];
          const start = toISO(day, time);

          rows.push({
            id: `showtime-${seed.slug}-${venue.venue}-${day}-${timeIndex}`,
            cinema_id: cinema.id,
            movie_id: movie.id,
            movie_title: movie.title,
            movie_slug: movie.slug,
            poster_url: movie.poster_url,
            category: movie.category,
            festival_name: movie.festival_name,
            rating: movie.rating,
            duration_mins: movie.duration_mins,
            screen_name: venue.screen ?? null,
            format,
            start_time: start,
            booking_url: bookingUrlFor(cinema.slug, movie.slug),
            ticket_price: venue.price ?? null,
          });
        });
      }
    }
  }

  return rows.sort((a, b) => a.start_time.localeCompare(b.start_time));
})();

function toISO(dateKey: string, time: string): string {
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)!;
  let hour = Number(m[1]);
  if (m[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (m[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
  return new Date(`${dateKey}T${String(hour).padStart(2, '0')}:${m[2]}:00+08:00`).toISOString();
}

function bookingUrlFor(cinemaSlug: string, movieSlug: string): string {
  const venue = ALL_VENUES.find((v) => v.slug === cinemaSlug);
  switch (venue?.chain) {
    case 'SM':
      return `https://www.smcinema.com/schedules?cinema=${cinemaSlug}&movie=${movieSlug}`;
    case 'Ayala':
      return `https://www.sureseats.com/cinema/${cinemaSlug}?movie=${movieSlug}`;
    case 'Vista':
      return `https://www.vistacinemas.com.ph/showtimes/${cinemaSlug}?movie=${movieSlug}`;
    case 'Robinsons':
      return `https://www.robinsonsmovieworld.com/${cinemaSlug}`;
    case 'FestivalVenue':
    case 'Microcinema':
    case 'Independent':
      return `https://ticket2me.net/search?q=${encodeURIComponent(movieSlug)}`;
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(`${movieSlug} showtimes`)}`;
  }
}

/**
 * In-memory stand-in for `get_nearby_cinemas_for_movie`. Same contract as the
 * RPC: radius filter, distance sort, and venues without a matching screening
 * are dropped entirely.
 */
export function mockNearbyCinemas(params: {
  lat: number;
  lng: number;
  movieId?: string | null;
  radiusMeters: number;
  from: string;
  until: string;
  formats?: string[] | null;
  categories?: string[] | null;
  festival?: string | null;
}): CinemaWithShowtimes[] {
  const { lat, lng, movieId, radiusMeters, from, until } = params;

  return MOCK_CINEMAS.map((cinema) => {
    const distance_km = haversineKm({ lat, lng }, { lat: cinema.lat, lng: cinema.lng });

    const showtimes = MOCK_SHOWTIMES.filter((s) => {
      if (s.cinema_id !== cinema.id) return false;
      if (s.start_time < from || s.start_time > until) return false;
      if (movieId && s.movie_id !== movieId) return false;
      if (params.formats?.length && !params.formats.includes(s.format)) return false;
      if (params.categories?.length && !params.categories.includes(s.category)) return false;
      if (params.festival && s.festival_name !== params.festival) return false;
      return true;
    }).map(({ cinema_id: _cinemaId, ...rest }) => rest);

    return { ...cinema, distance_km: Number(distance_km.toFixed(2)), showtimes };
  })
    .filter((c) => c.showtimes.length > 0 && c.distance_km * 1000 <= radiusMeters)
    .sort((a, b) => a.distance_km - b.distance_km);
}

export function mockSearchMovies(term: string, limit = 12) {
  const now = new Date().toISOString();
  const q = term.trim().toLowerCase();

  return MOCK_MOVIES.map((m) => {
    const upcoming = MOCK_SHOWTIMES.filter((s) => s.movie_id === m.id && s.start_time >= now);
    return {
      id: m.id,
      title: m.title,
      slug: m.slug,
      poster_url: m.poster_url,
      category: m.category,
      festival_name: m.festival_name,
      rating: m.rating,
      duration_mins: m.duration_mins,
      showtime_count: upcoming.length,
      next_showtime: upcoming[0]?.start_time ?? null,
    };
  })
    .filter((m) => m.showtime_count > 0)
    .filter((m) => !q || m.title.toLowerCase().includes(q) || (m.festival_name ?? '').toLowerCase().includes(q))
    .sort((a, b) => {
      if (q) {
        const aStarts = a.title.toLowerCase().startsWith(q);
        const bStarts = b.title.toLowerCase().startsWith(q);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
      }
      return b.showtime_count - a.showtime_count;
    })
    .slice(0, limit);
}

/** Every festival with at least one upcoming screening. */
export function mockFestivals(): string[] {
  return [...new Set(MOCK_MOVIES.map((m) => m.festival_name).filter(Boolean) as string[])].sort();
}

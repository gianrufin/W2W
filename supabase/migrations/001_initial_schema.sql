-- =============================================================================
-- W2W — Where, When, What 2 Watch
-- 001_initial_schema.sql — cinemas, movies, showtimes + PostGIS discovery RPCs
-- =============================================================================

create extension if not exists "postgis";
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

do $$ begin
  create type cinema_chain as enum (
    'SM',
    'Ayala',
    'Vista',
    'Robinsons',
    'Megaworld',
    'Fisher',
    'Newport',
    'ShangriLa',
    'Microcinema',
    'Independent',
    'FestivalVenue'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type movie_category as enum (
    'Mainstream',
    'Indie',
    'Festival',
    'Special Screening'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type screen_format as enum (
    '2D',
    '3D',
    'IMAX',
    'IMAX 3D',
    'A-Max',
    'Giant Screen',
    'ScreenX',
    '4DX',
    'Dolby Atmos',
    'Director''s Club',
    'A-Luxe',
    'VIP'
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- cinemas
-- -----------------------------------------------------------------------------

create table if not exists public.cinemas (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  chain        cinema_chain not null,
  location     geography(Point, 4326) not null,
  address      text,
  city         text,
  website_url  text,
  logo_url     text,
  -- Free-form venue notes: parking, entrance, screening-room quirks.
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- GIST index is what makes ST_DWithin a bounded index scan instead of a seq scan.
create index if not exists cinemas_location_idx on public.cinemas using gist (location);
create index if not exists cinemas_chain_idx on public.cinemas (chain);
create index if not exists cinemas_city_idx on public.cinemas (city);

-- -----------------------------------------------------------------------------
-- movies
-- -----------------------------------------------------------------------------

create table if not exists public.movies (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  slug           text not null unique,
  -- Uppercased, punctuation-stripped title used to reconcile the same film
  -- across chains that each spell it differently.
  normalized_title text not null,
  synopsis       text,
  poster_url     text,
  backdrop_url   text,
  rating         text,          -- G, PG, R-13, R-16, R-18
  duration_mins  int,
  category       movie_category not null default 'Mainstream',
  festival_name  text,          -- e.g. 'Cinemalaya 2026'
  release_date   date,
  genres         text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists movies_normalized_title_idx on public.movies (normalized_title);
create index if not exists movies_category_idx on public.movies (category);
create index if not exists movies_festival_idx on public.movies (festival_name)
  where festival_name is not null;

-- -----------------------------------------------------------------------------
-- showtimes
-- -----------------------------------------------------------------------------

create table if not exists public.showtimes (
  id            uuid primary key default gen_random_uuid(),
  cinema_id     uuid not null references public.cinemas (id) on delete cascade,
  movie_id      uuid not null references public.movies (id) on delete cascade,
  screen_name   text,                     -- "Cinema 1", "Atmos Hall"
  format        screen_format not null default '2D',
  start_time    timestamptz not null,
  booking_url   text,
  ticket_price  numeric(10, 2),
  source        text,                     -- which scraper produced this row
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- The pipeline upserts on this key, so a re-scrape refreshes prices and
  -- booking links instead of duplicating the screening.
  constraint showtimes_unique_screening
    unique (cinema_id, movie_id, start_time, format)
);

create index if not exists showtimes_start_time_idx on public.showtimes (start_time);
create index if not exists showtimes_cinema_start_idx on public.showtimes (cinema_id, start_time);
create index if not exists showtimes_movie_start_idx on public.showtimes (movie_id, start_time);

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cinemas_touch_updated_at on public.cinemas;
create trigger cinemas_touch_updated_at
  before update on public.cinemas
  for each row execute function public.touch_updated_at();

drop trigger if exists movies_touch_updated_at on public.movies;
create trigger movies_touch_updated_at
  before update on public.movies
  for each row execute function public.touch_updated_at();

drop trigger if exists showtimes_touch_updated_at on public.showtimes;
create trigger showtimes_touch_updated_at
  before update on public.showtimes
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RPC: get_nearby_cinemas_for_movie
--
-- The single query behind the map. Returns every cinema within `radius_meters`
-- of the user, its distance in km, and the upcoming showtimes at that venue as
-- a JSON array. When `search_movie_id` is supplied, venues that are not
-- screening that film are dropped entirely — this is what lets the map filter
-- down to "only places showing Dune 2".
-- -----------------------------------------------------------------------------

create or replace function public.get_nearby_cinemas_for_movie(
  user_lat        float,
  user_lng        float,
  search_movie_id uuid    default null,
  radius_meters   int     default 15000,
  from_time       timestamptz default now(),
  until_time      timestamptz default null,
  formats         text[]  default null,
  categories      text[]  default null,
  festival        text    default null
)
returns table (
  cinema_id    uuid,
  name         text,
  slug         text,
  chain        text,
  address      text,
  city         text,
  website_url  text,
  logo_url     text,
  lat          float,
  lng          float,
  distance_km  float,
  showtimes    jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with user_point as (
    select st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography as g
  ),
  window_bounds as (
    select
      coalesce(from_time, now()) as lower,
      coalesce(until_time, coalesce(from_time, now()) + interval '14 days') as upper
  ),
  in_radius as (
    select c.*, st_distance(c.location, u.g) as distance_m
    from public.cinemas c, user_point u
    where st_dwithin(c.location, u.g, radius_meters)
  ),
  relevant as (
    select
      s.cinema_id,
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'movie_id', s.movie_id,
          'movie_title', m.title,
          'movie_slug', m.slug,
          'poster_url', m.poster_url,
          'category', m.category,
          'festival_name', m.festival_name,
          'rating', m.rating,
          'duration_mins', m.duration_mins,
          'screen_name', s.screen_name,
          'format', s.format,
          'start_time', s.start_time,
          'booking_url', s.booking_url,
          'ticket_price', s.ticket_price
        )
        order by s.start_time
      ) as showtimes
    from public.showtimes s
    join public.movies m on m.id = s.movie_id
    cross join window_bounds w
    where s.start_time >= w.lower
      and s.start_time <= w.upper
      and (search_movie_id is null or s.movie_id = search_movie_id)
      and (formats is null or s.format::text = any (formats))
      and (categories is null or m.category::text = any (categories))
      and (festival is null or m.festival_name = festival)
    group by s.cinema_id
  )
  select
    c.id,
    c.name,
    c.slug,
    c.chain::text,
    c.address,
    c.city,
    c.website_url,
    c.logo_url,
    st_y(c.location::geometry)::float as lat,
    st_x(c.location::geometry)::float as lng,
    round((c.distance_m / 1000.0)::numeric, 2)::float as distance_km,
    coalesce(r.showtimes, '[]'::jsonb)
  from in_radius c
  -- An inner join is the filter: no matching screening, no pin on the map.
  join relevant r on r.cinema_id = c.id
  order by c.distance_m asc;
$$;

-- -----------------------------------------------------------------------------
-- RPC: search_movies_with_showtimes
-- Autocomplete for the floating search bar — only returns films that actually
-- have an upcoming screening somewhere.
-- -----------------------------------------------------------------------------

create or replace function public.search_movies_with_showtimes(
  search_term text default '',
  max_results int  default 12
)
returns table (
  id             uuid,
  title          text,
  slug           text,
  poster_url     text,
  category       text,
  festival_name  text,
  rating         text,
  duration_mins  int,
  showtime_count bigint,
  next_showtime  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.title,
    m.slug,
    m.poster_url,
    m.category::text,
    m.festival_name,
    m.rating,
    m.duration_mins,
    count(s.id) as showtime_count,
    min(s.start_time) as next_showtime
  from public.movies m
  join public.showtimes s on s.movie_id = m.id and s.start_time >= now()
  where
    coalesce(search_term, '') = ''
    or m.title ilike '%' || search_term || '%'
    or m.normalized_title like '%' || upper(regexp_replace(search_term, '[^a-zA-Z0-9]', '', 'g')) || '%'
  group by m.id
  order by (coalesce(search_term, '') <> '' and m.title ilike search_term || '%') desc,
           count(s.id) desc,
           m.title asc
  limit max_results;
$$;

-- -----------------------------------------------------------------------------
-- Row level security — the app reads with the anon key; writes come from the
-- scraper pipeline using the service role, which bypasses RLS.
-- -----------------------------------------------------------------------------

alter table public.cinemas   enable row level security;
alter table public.movies    enable row level security;
alter table public.showtimes enable row level security;

drop policy if exists "cinemas are public" on public.cinemas;
create policy "cinemas are public" on public.cinemas for select using (true);

drop policy if exists "movies are public" on public.movies;
create policy "movies are public" on public.movies for select using (true);

drop policy if exists "showtimes are public" on public.showtimes;
create policy "showtimes are public" on public.showtimes for select using (true);

grant execute on function public.get_nearby_cinemas_for_movie(
  float, float, uuid, int, timestamptz, timestamptz, text[], text[], text
) to anon, authenticated;

grant execute on function public.search_movies_with_showtimes(text, int) to anon, authenticated;

-- =============================================================================
-- 007_distance_from_user.sql — measure distance from the user, not the map.
--
-- The RPC took one point and used it for two different jobs: the centre of the
-- radius search, and the origin for `distance_km`. Those are the same point
-- only while the map is sitting on top of you.
--
-- The moment area search moved the map, they diverged and nobody noticed,
-- because the number stayed small and plausible. Browsing Cebu from Manila,
-- every card read "1.2 km · 3 min drive" — measured from the Cebu map centre.
-- Meanwhile the "leave by" bar, which had always used the real user location,
-- quietly disagreed with the card right above it.
--
-- So the function now takes both:
--
--   search_lat/search_lng   where to look        → drives ST_DWithin
--   user_lat/user_lng       where the user is    → drives distance_km
--
-- Sorting deliberately stays on distance from the *search* centre. Ordering a
-- list of Cebu venues by their distance from Manila is arbitrary — they are all
-- ~570 km away and the order would be noise. "Nearest to what you are looking
-- at" is the useful ordering; "how far it is from you" is the useful number.
--
-- `search_lat`/`search_lng` default to null and fall back to the user point, so
-- an old client that only sends `user_lat`/`user_lng` behaves exactly as before.
-- =============================================================================

-- Adding parameters changes the signature, and `create or replace` treats a new
-- signature as a new *overload* rather than a replacement. Leaving both in place
-- makes every call ambiguous — Postgres answers
-- "could not choose a best candidate function" and the map goes blank. The old
-- nine-argument version has to go explicitly.
drop function if exists public.get_nearby_cinemas_for_movie(
  float, float, uuid, int, timestamptz, timestamptz, text[], text[], text
);

create or replace function public.get_nearby_cinemas_for_movie(
  user_lat        float,
  user_lng        float,
  search_movie_id uuid    default null,
  radius_meters   int     default 15000,
  from_time       timestamptz default now(),
  until_time      timestamptz default null,
  formats         text[]  default null,
  categories      text[]  default null,
  festival        text    default null,
  -- Added last so every existing positional call still binds correctly.
  search_lat      float   default null,
  search_lng      float   default null
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
  with points as (
    select
      -- Where the user actually is. Distances are always measured from here.
      st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography as user_g,
      -- Where they are looking. Falls back to the user when unset, which is the
      -- case on first load and whenever the map has not been moved.
      st_setsrid(
        st_makepoint(coalesce(search_lng, user_lng), coalesce(search_lat, user_lat)),
        4326
      )::geography as search_g
  ),
  window_bounds as (
    select
      coalesce(from_time, now()) as lower,
      coalesce(until_time, coalesce(from_time, now()) + interval '14 days') as upper
  ),
  in_radius as (
    select
      c.*,
      -- Two distances, two jobs. `search_m` orders the list; `user_m` is what
      -- the card prints and what the drive estimate is built from.
      st_distance(c.location, p.search_g) as search_m,
      st_distance(c.location, p.user_g) as user_m
    from public.cinemas c, points p
    where st_dwithin(c.location, p.search_g, radius_meters)
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
    round((c.user_m / 1000.0)::numeric, 2)::float as distance_km,
    coalesce(r.showtimes, '[]'::jsonb)
  from in_radius c
  -- An inner join is the filter: no matching screening, no pin on the map.
  join relevant r on r.cinema_id = c.id
  order by c.search_m asc;
$$;

grant execute on function public.get_nearby_cinemas_for_movie(
  float, float, uuid, int, timestamptz, timestamptz, text[], text[], text, float, float
) to anon, authenticated;

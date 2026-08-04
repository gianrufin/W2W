-- =============================================================================
-- 002_place_search.sql — area search for "I'm travelling there next week"
--
-- The app needs to jump the map to a city or a named cinema. Reading the
-- geography column straight through PostgREST does not work: it comes back as
-- hex EWKB rather than GeoJSON, so the coordinates were unusable client-side.
-- This does the projection in SQL, where the geometry functions live.
--
-- Only venues with an upcoming screening are offered. Sending someone to a city
-- whose cinemas have no schedule loaded is a dead end.
-- =============================================================================

create or replace function public.search_places(
  search_term text default '',
  max_results int default 8
)
returns table (
  kind        text,
  label       text,
  sublabel    text,
  lat         float,
  lng         float,
  venue_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select c.*
    from public.cinemas c
    where exists (
      select 1 from public.showtimes s
      where s.cinema_id = c.id and s.start_time >= now()
    )
  ),
  cities as (
    select
      -- Cities rank ahead of individual branches: someone typing a place name
      -- wants the area, not one cinema inside it.
      0 as sort_rank,
      'city'::text as kind,
      c.city as label,
      -- Built here rather than in the outer select so both branches of the
      -- UNION expose an identical column list.
      (count(*) || ' ' || case when count(*) = 1 then 'cinema' else 'cinemas' end)::text
        as sublabel,
      -- Centroid of the city's cinemas, so the map lands among them rather than
      -- on whichever branch happened to sort first.
      st_y(st_centroid(st_collect(c.location::geometry)))::float as lat,
      st_x(st_centroid(st_collect(c.location::geometry)))::float as lng,
      count(*)::bigint as venue_count
    from live c
    where c.city is not null and c.city <> ''
      and (coalesce(search_term, '') = '' or c.city ilike '%' || search_term || '%')
    group by c.city
  ),
  venues as (
    select
      1 as sort_rank,
      'cinema'::text as kind,
      c.name as label,
      c.city::text as sublabel,
      st_y(c.location::geometry)::float as lat,
      st_x(c.location::geometry)::float as lng,
      1::bigint as venue_count
    from live c
    where coalesce(search_term, '') <> ''
      and c.name ilike '%' || search_term || '%'
  ),
  combined as (
    select sort_rank, kind, label, sublabel, lat, lng, venue_count from cities
    union all
    select sort_rank, kind, label, sublabel, lat, lng, venue_count from venues
  )
  -- The sort has to live outside the UNION: Postgres only accepts plain output
  -- column names in a UNION's own ORDER BY, not expressions, which is why
  -- sort_rank is a real column rather than `order by (kind = 'city') desc`.
  select kind, label, sublabel, lat, lng, venue_count
  from combined
  order by sort_rank asc, venue_count desc, label asc
  limit max_results;
$$;

grant execute on function public.search_places(text, int) to anon, authenticated;

-- =============================================================================
-- 006_word_search.sql — make search match the way people type.
--
-- Both search functions used a single substring test:
--
--   name ilike '%' || search_term || '%'
--
-- which requires the query to appear verbatim, in order, as one run of
-- characters. So "sm tanza" found nothing, because the cinema is called
-- "SM City Tanza" and the word "City" sits between the two things the user
-- typed. Nobody types a venue's full legal name, and being made to is the
-- opposite of a search box.
--
-- This replaces it with word-AND matching: split the query on whitespace and
-- require every word to appear somewhere, in any order. "sm tanza",
-- "tanza sm" and "sm city tanza" all find SM City Tanza; "sm" alone still
-- finds every SM branch.
--
-- Word-AND rather than fuzzy/trigram on purpose. Trigram similarity would also
-- match this, but it matches a great deal else besides, and a search that
-- confidently offers the wrong cinema is worse here than one that offers
-- nothing — the whole app is about not sending people to the wrong building.
-- =============================================================================

/**
 * Does every word of `search_term` appear in `haystack`?
 *
 * Empty or whitespace-only queries match everything, which is what the callers
 * want for an unfiltered list.
 */
create or replace function public.matches_all_words(haystack text, search_term text)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(
    (
      select bool_and(haystack ilike '%' || word || '%')
      from unnest(
        -- Collapse punctuation to spaces first, so "sm, tanza" and "sm-tanza"
        -- behave like "sm tanza".
        string_to_array(
          trim(regexp_replace(coalesce(search_term, ''), '[^a-zA-Z0-9]+', ' ', 'g')),
          ' '
        )
      ) as word
      where word <> ''
    ),
    true
  );
$$;

-- -----------------------------------------------------------------------------
-- Places — cities and venues
-- -----------------------------------------------------------------------------

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
      (count(*) || ' ' || case when count(*) = 1 then 'cinema' else 'cinemas' end)::text
        as sublabel,
      st_y(st_centroid(st_collect(c.location::geometry)))::float as lat,
      st_x(st_centroid(st_collect(c.location::geometry)))::float as lng,
      count(*)::bigint as venue_count
    from live c
    where c.city is not null and c.city <> ''
      and public.matches_all_words(c.city, search_term)
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
      -- The city is searched alongside the name, so "tanza cinema" finds the
      -- venues in Tanza even when none of them has "Tanza" in its own name.
      and public.matches_all_words(c.name || ' ' || coalesce(c.city, ''), search_term)
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
grant execute on function public.matches_all_words(text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Films
-- -----------------------------------------------------------------------------

create or replace function public.search_movies_with_showtimes(
  search_term text default '',
  max_results int default 12
)
returns table (
  id            uuid,
  title         text,
  slug          text,
  poster_url    text,
  category      text,
  festival_name text,
  rating        text,
  duration_mins int,
  showtime_count bigint,
  next_showtime timestamptz
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
    public.matches_all_words(m.title, search_term)
    -- The normalized title carries no spaces, so it only helps when the query
    -- is written as one run too ("spiderman"). Kept as an alternative, not a
    -- replacement.
    or m.normalized_title like
       '%' || upper(regexp_replace(coalesce(search_term, ''), '[^a-zA-Z0-9]', '', 'g')) || '%'
  group by m.id
  -- A title that starts with what was typed comes first; then the film with the
  -- most screenings, which is the one most people mean.
  order by (coalesce(search_term, '') <> '' and m.title ilike search_term || '%') desc,
           count(s.id) desc,
           m.title asc
  limit max_results;
$$;

grant execute on function public.search_movies_with_showtimes(text, int) to anon, authenticated;

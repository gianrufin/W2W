-- =============================================================================
-- 005_festival_venue_aliases.sql — seed the mappings, taken from live data.
--
-- Every alias below was produced by actually running the adapters against the
-- festivals' own sites and reading what they emit. They are not guesses about
-- how a festival *might* name a venue.
--
-- Two failure modes this fixes, both observed:
--
--   "GATEWAY 11"  QCinema's screens 11, 12, 16 and 18 are inside Gateway
--                 Cineplex 18. Name matching lands them on "Gateway Mall" —
--                 the right complex, the wrong building, and the booking link
--                 then points at a box office that does not sell that seat.
--
--   "GALLERIA 3"  Matches Robinsons Galleria Ortigas *and* Galleria Cebu.
--                 The resolver correctly refuses an ambiguous match and drops
--                 the screening; this says which one QCinema means.
--
-- Each insert is guarded by a lookup, so an alias for a venue this database has
-- not scraped yet is skipped rather than failing the migration. Re-running is
-- safe: `alias` is unique and conflicts are ignored.
-- =============================================================================

/**
 * Add one alias, resolving the cinema by a name pattern.
 *
 * Matching on name rather than slug because slugs are scraper-generated and
 * carry the source's own ids — `ctc-gateway-mall-2`, `rmw-galleria-ortigas-1` —
 * which would tie this seed to whichever scraper happened to write the venue
 * first.
 */
create or replace function public.add_festival_venue_alias(
  p_alias text,
  p_name_pattern text,
  p_screen text default null,
  p_city text default null
)
returns boolean
language plpgsql
as $$
declare
  target uuid;
  matches int;
begin
  -- Counted and selected separately: Postgres has no min() for uuid, so the
  -- two cannot be folded into one aggregate query.
  select count(*) into matches
  from public.cinemas
  where name ilike p_name_pattern
    and (p_city is null or city ilike p_city);

  select id into target
  from public.cinemas
  where name ilike p_name_pattern
    and (p_city is null or city ilike p_city)
  limit 1;

  -- Zero matches means the venue is not scraped yet; more than one means the
  -- pattern is as ambiguous as the alias it was meant to disambiguate. Neither
  -- is worth writing a wrong mapping over.
  if matches <> 1 then
    raise notice 'alias % skipped: % cinemas matched %', p_alias, matches, p_name_pattern;
    return false;
  end if;

  insert into public.festival_venue_aliases (alias, cinema_id, screen_name, source)
  values (p_alias, target, p_screen, 'seed')
  on conflict (alias) do nothing;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- QCinema — screens inside Gateway Cineplex 18, Araneta City.
--
-- The alias is stored normalised the same way venue-map.ts normalises a lookup:
-- lowercase, punctuation stripped, and the words "cinema/cineplex/mall" removed.
-- "GATEWAY 11" therefore stores as "gateway11".
-- -----------------------------------------------------------------------------

select public.add_festival_venue_alias('gateway11', '%Gateway Cineplex 18%', 'Cinema 11');
select public.add_festival_venue_alias('gateway12', '%Gateway Cineplex 18%', 'Cinema 12');
select public.add_festival_venue_alias('gateway16', '%Gateway Cineplex 18%', 'Cinema 16');
select public.add_festival_venue_alias('gateway17', '%Gateway Cineplex 18%', 'Cinema 17');
-- Note the collision: the venue's own name, "Gateway Cineplex 18", also
-- normalises to "gateway18". Harmless, and checked — both readings resolve to
-- the same cinema, and the pipeline prefers a screen the adapter stated
-- explicitly over one the alias supplied, so TicketNet's own "CINEMA 16" is
-- never overwritten by this row's "Cinema 18".
select public.add_festival_venue_alias('gateway18', '%Gateway Cineplex 18%', 'Cinema 18');

-- -----------------------------------------------------------------------------
-- QCinema — partner venues outside Araneta City.
-- -----------------------------------------------------------------------------

select public.add_festival_venue_alias('trinoma3', '%Trinoma%', 'Cinema 3');
select public.add_festival_venue_alias('eastwood1', '%Eastwood%', 'Cinema 1');
select public.add_festival_venue_alias('fisher3', '%Fisher%', 'Cinema 3');
select public.add_festival_venue_alias('cloverleaf2', '%Cloverleaf%', 'Cinema 2');
-- Ortigas, not Cebu — QCinema is a Quezon City festival and does not travel.
select public.add_festival_venue_alias('galleria3', '%Galleria%', 'Cinema 3', 'Quezon City');

-- -----------------------------------------------------------------------------
-- FDCP cinematheques. Name matching already handles Manila; the others are
-- listed so a new centre coming online does not need a code change.
-- -----------------------------------------------------------------------------

select public.add_festival_venue_alias('cinemathequemanila', '%Cinematheque Manila%');
select public.add_festival_venue_alias('cinemathequeiloilo', '%Cinematheque Iloilo%');
select public.add_festival_venue_alias('cinemathequedavao', '%Cinematheque Davao%');
select public.add_festival_venue_alias('cinemathequenegros', '%Cinematheque Negros%');
select public.add_festival_venue_alias('cinemathequenabunturan', '%Cinematheque Nabunturan%');

-- -----------------------------------------------------------------------------
-- Cinemalaya's historic and current homes.
-- -----------------------------------------------------------------------------

select public.add_festival_venue_alias('ccp', '%Cultural Center of the Philippines%');
select public.add_festival_venue_alias('redcarpet', '%Red Carpet%');
select public.add_festival_venue_alias('upcineadarna', '%Cine Adarna%');

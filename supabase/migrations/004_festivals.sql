-- =============================================================================
-- 003_festivals.sql — film festivals, cinematheque programmes and special
-- screenings.
--
-- Design constraint: this must be *additive*. The regular chain pipeline (SM
-- especially) is live, and nothing here may change how a chain scraper writes a
-- row. So:
--
--   - `festivals` is a new table. Nothing existing references it.
--   - `movies` and `showtimes` gain nullable columns with defaults, so every
--     existing writer keeps working untouched and unaware.
--   - The festival ingest is a separate service (lib/festivals) writing through
--     the same tables, which is what lets one map show both without the app
--     needing to know there were two pipelines.
--
-- Festival data is seasonal, which is the thing that makes it different from a
-- cinema schedule. A chain's showtimes are simply pruned once they pass;
-- a festival's *programme* stays interesting after it ends (what played, where)
-- while its screenings must stop appearing. Hence `is_active`, driven by the
-- date window rather than by a scraper remembering to unset it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

do $$ begin
  -- What kind of slot this is within a festival's programme. Distinct from
  -- movie_category, which describes the *film*; a Gala and a regular screening
  -- can be the same film.
  create type festival_section as enum (
    'Feature',
    'Shorts',
    'Gala',
    'Competition',
    'Retrospective',
    'Talkback',
    'Masterclass',
    'Special Screening'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type festival_cadence as enum (
    'annual',      -- Cinemalaya, QCinema, MMFF
    'seasonal',    -- limited runs that recur irregularly
    'continuous'   -- the cinematheques: always programming, never "over"
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- festivals
-- -----------------------------------------------------------------------------

create table if not exists public.festivals (
  id          uuid primary key default gen_random_uuid(),
  -- Stable across editions: 'cinemalaya'. The edition lives in edition_year.
  slug        text not null,
  name        text not null,
  edition_year int not null,
  cadence     festival_cadence not null default 'annual',

  -- The run window. Both nullable because an edition is often announced before
  -- its dates are: recording "Cinemalaya 23 exists" is useful even then.
  screening_start_date date,
  screening_end_date   date,

  -- Whether this edition's screenings should surface in the app. Maintained by
  -- refresh_festival_activity() from the window above, never hand-set by a
  -- scraper — a scraper that crashes mid-run would otherwise leave a dead
  -- festival flagged live.
  is_active   boolean not null default false,

  official_url text,
  ticket_url   text,
  -- Which adapter produced this row, for the same reason showtimes.source exists.
  source       text,
  -- Bumped every run that still sees the festival. A festival whose site has
  -- gone quiet for weeks is visible in this column rather than silently stale.
  last_seen_at timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One row per edition. Re-running an adapter refreshes it in place.
  constraint festivals_unique_edition unique (slug, edition_year)
);

create index if not exists festivals_active_idx on public.festivals (is_active)
  where is_active;
create index if not exists festivals_window_idx
  on public.festivals (screening_start_date, screening_end_date);

-- -----------------------------------------------------------------------------
-- movies — festival programme metadata
--
-- These live on `movies` rather than a parallel table because a festival title
-- *is* a film: it needs the same search, the same poster, the same normalized
-- title reconciliation. Splitting them would mean every query in the app had to
-- know about two kinds of film.
-- -----------------------------------------------------------------------------

alter table public.movies
  add column if not exists festival_id uuid references public.festivals (id) on delete set null,
  add column if not exists director text,
  add column if not exists section festival_section,
  add column if not exists country text,
  add column if not exists year_produced int;

create index if not exists movies_festival_id_idx on public.movies (festival_id)
  where festival_id is not null;

-- -----------------------------------------------------------------------------
-- showtimes — festival screening details
--
-- A festival screening carries things a chain screening never does: whether the
-- director is in the room afterwards, whether it is streamed rather than
-- projected, and which of several ticket portals sells it.
-- -----------------------------------------------------------------------------

alter table public.showtimes
  add column if not exists festival_id uuid references public.festivals (id) on delete cascade,
  -- A Q&A or director's talkback follows this screening. Materially changes how
  -- long you need to be there, and is often the reason to pick this slot.
  add column if not exists talkback boolean not null default false,
  -- Streamed, not projected. `cinema_id` then means "the presenting venue", and
  -- the distance sort is meaningless — the UI must not offer directions.
  add column if not exists is_online_screening boolean not null default false,
  -- 'ktx', 'ticketnet', 'venue-box-office' — which portal booking_url points at.
  add column if not exists ticket_portal text,
  -- Invite-only or press screenings: listed for completeness, not bookable.
  add column if not exists admission text;

create index if not exists showtimes_festival_idx on public.showtimes (festival_id, start_time)
  where festival_id is not null;

-- -----------------------------------------------------------------------------
-- festival_venue_aliases
--
-- Festivals name venues the way an audience says them: "GATEWAY 11",
-- "TriNoma 3", "Cinematheque Manila". None of those are branch names in
-- `cinemas`, and "GATEWAY 11" is a *screen* inside a venue we already have.
--
-- This is the mapping layer. It is a table rather than a constant in code
-- because it grows every festival season, and a wrong pin is a real cost —
-- being able to correct one with an INSERT rather than a deploy matters.
-- -----------------------------------------------------------------------------

create table if not exists public.festival_venue_aliases (
  id         uuid primary key default gen_random_uuid(),
  -- The festival's spelling, normalised: lowercase, punctuation stripped.
  alias      text not null unique,
  cinema_id  uuid not null references public.cinemas (id) on delete cascade,
  -- The screen within that venue, when the alias identified one ("GATEWAY 11"
  -- → Gateway Cineplex 18, screen 11).
  screen_name text,
  -- Where this mapping came from: 'manual' or the adapter that proposed it.
  source     text,
  created_at timestamptz not null default now()
);

create index if not exists festival_venue_aliases_cinema_idx
  on public.festival_venue_aliases (cinema_id);

-- -----------------------------------------------------------------------------
-- Lifecycle
-- -----------------------------------------------------------------------------

/**
 * Recompute is_active from each edition's date window.
 *
 * Run on every festival ingest and from the scheduled prune. Deriving the flag
 * rather than storing a decision means a festival cannot get stuck "live"
 * because the run that was supposed to close it never happened.
 *
 * Continuous programmers (the cinematheques) are always active: they have no
 * season to be outside of.
 */
create or replace function public.refresh_festival_activity()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  changed int;
begin
  with today as (
    -- Manila's date, not the server's. A festival ending "today" should stay
    -- live through its last evening screening.
    select (now() at time zone 'Asia/Manila')::date as d
  )
  update public.festivals f
  set is_active = case
    when f.cadence = 'continuous' then true
    when f.screening_start_date is null or f.screening_end_date is null then false
    else (select d from today) between f.screening_start_date and f.screening_end_date
  end
  where f.is_active is distinct from case
    when f.cadence = 'continuous' then true
    when f.screening_start_date is null or f.screening_end_date is null then false
    else (select d from today) between f.screening_start_date and f.screening_end_date
  end;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

/**
 * Archive a finished edition's screenings.
 *
 * Deletes the *screenings* of festivals that ended more than `grace_days` ago,
 * and leaves the festival and its films in place. What played at Cinemalaya 22
 * stays answerable; when it played stops cluttering a map of tonight.
 *
 * Chain showtimes are untouched — the festival_id filter is what keeps this
 * strictly inside the festival pipeline's own data.
 */
create or replace function public.archive_past_festival_screenings(grace_days int default 2)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  delete from public.showtimes s
  using public.festivals f
  where s.festival_id = f.id
    and f.cadence <> 'continuous'
    and f.screening_end_date is not null
    and f.screening_end_date < ((now() at time zone 'Asia/Manila')::date - grace_days);

  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- -----------------------------------------------------------------------------
-- Read API
-- -----------------------------------------------------------------------------

/**
 * Festivals worth showing in the UI right now.
 *
 * Returns editions that are running or about to, newest window first, with a
 * live screening count so the Festival Focus rail can hide an edition whose
 * programme has not been published yet rather than offering an empty filter.
 */
create or replace function public.get_active_festivals(horizon_days int default 30)
returns table (
  slug text,
  name text,
  edition_year int,
  screening_start_date date,
  screening_end_date date,
  official_url text,
  ticket_url text,
  is_active boolean,
  screening_count bigint,
  venue_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.slug,
    f.name,
    f.edition_year,
    f.screening_start_date,
    f.screening_end_date,
    f.official_url,
    f.ticket_url,
    f.is_active,
    count(s.id) as screening_count,
    count(distinct s.cinema_id) as venue_count
  from public.festivals f
  left join public.showtimes s
    on s.festival_id = f.id and s.start_time >= now()
  where f.is_active
     or (
       f.screening_start_date is not null
       and f.screening_start_date
             between (now() at time zone 'Asia/Manila')::date
                 and ((now() at time zone 'Asia/Manila')::date + horizon_days)
     )
  group by f.id
  order by f.screening_start_date asc nulls last, f.name asc;
$$;

grant execute on function public.get_active_festivals(int) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS — same posture as the rest of the schema: world-readable, service-role
-- writes only.
-- -----------------------------------------------------------------------------

alter table public.festivals enable row level security;
alter table public.festival_venue_aliases enable row level security;

do $$ begin
  create policy festivals_public_read on public.festivals for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy festival_aliases_public_read
    on public.festival_venue_aliases for select using (true);
exception when duplicate_object then null; end $$;

drop trigger if exists festivals_touch_updated_at on public.festivals;
create trigger festivals_touch_updated_at
  before update on public.festivals
  for each row execute function public.touch_updated_at();

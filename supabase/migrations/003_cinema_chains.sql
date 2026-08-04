-- =============================================================================
-- 003_cinema_chains.sql — new operators reached by the expanded scrapers.
--
-- `cinema_chain` is a Postgres enum, so adding a chain in TypeScript is only
-- half the change: the first scrape that emits one the database has never heard
-- of fails the whole batch with "invalid input value for enum cinema_chain".
--
-- ADD VALUE cannot run inside a transaction block on older Postgres, which is
-- why this is its own migration rather than a few lines bolted onto another.
-- =============================================================================

-- Araneta City — Gateway Cineplex 18 and Gateway Mall 2, ticketed via TicketNet.
alter type cinema_chain add value if not exists 'Araneta';

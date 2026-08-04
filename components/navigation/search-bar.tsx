'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X, Loader2, Sparkles, Film } from 'lucide-react';
import { searchMovies } from '@/lib/data';
import { useDiscoveryStore } from '@/store/use-discovery-store';
import { cn, formatDuration } from '@/lib/utils';
import type { MovieSearchResult } from '@/types';

/**
 * Movie-first search.
 *
 * Picking a suggestion sets `selectedMovie`, which re-runs the discovery query
 * with a movie id — the map then shows only venues screening that film.
 */
export function SearchBar() {
  const searchTerm = useDiscoveryStore((s) => s.searchTerm);
  const setSearchTerm = useDiscoveryStore((s) => s.setSearchTerm);
  const selectedMovie = useDiscoveryStore((s) => s.selectedMovie);
  const setSelectedMovie = useDiscoveryStore((s) => s.setSelectedMovie);

  const [results, setResults] = useState<MovieSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  // Debounced autocomplete. The guard on `selectedMovie` stops the dropdown
  // from reopening the moment a suggestion fills the input.
  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setLoading(true);

    const timer = setTimeout(() => {
      searchMovies(searchTerm, 8)
        .then((movies) => {
          if (id !== requestId.current) return;
          setResults(movies);
          setActiveIndex(0);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 180);

    return () => clearTimeout(timer);
  }, [searchTerm, open]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function choose(movie: MovieSearchResult) {
    setSelectedMovie(movie);
    setOpen(false);
  }

  function clear() {
    setSelectedMovie(null);
    setSearchTerm('');
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          'glass-panel flex items-center gap-2.5 px-4 py-3 shadow-float transition',
          open ? 'border-brand/40' : 'border-hairline',
        )}
      >
        {loading && open ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-muted" />
        )}

        <input
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (selectedMovie) setSelectedMovie(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search a film — Dune: Part Two, Cinemalaya entries…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          aria-label="Search movies"
          aria-expanded={open}
          role="combobox"
          aria-controls="w2w-search-results"
        />

        {(searchTerm || selectedMovie) && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="shrink-0 rounded-xl p-1 text-muted transition hover:bg-surface hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="w2w-search-results"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="glass-panel no-scrollbar absolute left-0 right-0 top-full z-50 mt-2 max-h-[380px] overflow-y-auto p-1.5 shadow-float"
          >
            {results.length === 0 && !loading && (
              <p className="px-3 py-6 text-center text-xs text-muted">
                No films with upcoming screenings match “{searchTerm}”.
              </p>
            )}

            {results.map((movie, i) => (
              <button
                key={movie.id}
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(movie)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition',
                  i === activeIndex ? 'bg-surface' : 'hover:bg-surface/60',
                )}
              >
                {movie.poster_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={movie.poster_url}
                    alt=""
                    className="h-12 w-8 shrink-0 rounded-xl border border-hairline object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-8 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface">
                    <Film className="h-3.5 w-3.5 text-muted" />
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="font-title block truncate text-[15px] text-ink">
                    {movie.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    {movie.rating && <span>{movie.rating}</span>}
                    {formatDuration(movie.duration_mins) && (
                      <span>{formatDuration(movie.duration_mins)}</span>
                    )}
                    <span>{movie.showtime_count} screenings</span>
                  </span>
                </span>

                {movie.festival_name && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-tertiary/25 bg-tertiarysoft px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-tertiarysoftfg">
                    <Sparkles className="h-2.5 w-2.5" />
                    {movie.festival_name}
                  </span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

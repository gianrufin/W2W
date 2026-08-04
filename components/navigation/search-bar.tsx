'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X, Loader2, Film, MapPin, Building2 } from 'lucide-react';
import { searchMovies, searchPlaces, type PlaceResult } from '@/lib/data';
import { useDiscoveryStore } from '@/store/use-discovery-store';
import { cn, formatDuration } from '@/lib/utils';
import type { MovieSearchResult } from '@/types';

/**
 * One field, two kinds of answer.
 *
 * Films narrow the map to venues screening them; places move the map somewhere
 * else entirely — which is the point when you are planning around a trip rather
 * than standing on a street.
 *
 * The placeholder names no film on purpose. A hardcoded title dates the product
 * the moment that film leaves cinemas, and there is no good reason to guess at
 * what someone wants to watch.
 */
export function SearchBar() {
  const searchTerm = useDiscoveryStore((s) => s.searchTerm);
  const setSearchTerm = useDiscoveryStore((s) => s.setSearchTerm);
  const selectedMovie = useDiscoveryStore((s) => s.selectedMovie);
  const setSelectedMovie = useDiscoveryStore((s) => s.setSelectedMovie);
  const goToArea = useDiscoveryStore((s) => s.goToArea);

  const [movies, setMovies] = useState<MovieSearchResult[]>([]);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setLoading(true);

    const timer = setTimeout(() => {
      Promise.all([searchMovies(searchTerm, 6), searchPlaces(searchTerm, 5)])
        .then(([m, p]) => {
          if (id !== requestId.current) return;
          setMovies(m);
          setPlaces(p);
        })
        .catch(() => {
          if (id === requestId.current) {
            setMovies([]);
            setPlaces([]);
          }
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

  function chooseMovie(movie: MovieSearchResult) {
    setSelectedMovie(movie);
    setOpen(false);
  }

  function choosePlace(place: PlaceResult) {
    // A city gets a wider frame than a single branch.
    goToArea({ lat: place.lat, lng: place.lng }, place.kind === 'city' ? 12 : 14.5, place.label);
    setSearchTerm(place.label);
    setOpen(false);
  }

  function clear() {
    setSelectedMovie(null);
    setSearchTerm('');
    setOpen(false);
  }

  const nothing = !loading && movies.length === 0 && places.length === 0;

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-2xl border bg-surface px-4 py-3.5 shadow-soft transition',
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
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder="Movie, cinema, or city"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
          aria-label="Search films, cinemas and cities"
        />

        {(searchTerm || selectedMovie) && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-surface hover:text-ink active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="glass-panel no-scrollbar absolute left-0 right-0 top-full z-50 mt-2 max-h-[60dvh] overflow-y-auto overscroll-contain rounded-3xl p-2 shadow-float"
          >
            {nothing && (
              <p className="px-3 py-6 text-center text-[13px] text-muted">
                {searchTerm
                  ? `Nothing matching “${searchTerm}”.`
                  : 'Type a film to find where it is playing, or a city to look ahead of a trip.'}
              </p>
            )}

            {places.length > 0 && (
              <Section title="Places">
                {places.map((place) => (
                  <button
                    key={`${place.kind}-${place.label}`}
                    type="button"
                    onClick={() => choosePlace(place)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-surface active:scale-[0.99]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                      {place.kind === 'city' ? (
                        <MapPin className="h-4 w-4" />
                      ) : (
                        <Building2 className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-label block truncate text-[14px] text-ink">
                        {place.label}
                      </span>
                      {place.sublabel && (
                        <span className="block truncate text-[11px] text-muted">
                          {place.sublabel}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </Section>
            )}

            {movies.length > 0 && (
              <Section title="Films">
                {movies.map((movie) => (
                  <button
                    key={movie.id}
                    type="button"
                    onClick={() => chooseMovie(movie)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-surface active:scale-[0.99]"
                  >
                    {movie.poster_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={movie.poster_url}
                        alt=""
                        loading="lazy"
                        className="h-14 w-10 shrink-0 rounded-xl border border-hairline object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface">
                        <Film className="h-4 w-4 text-muted" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="font-label block truncate text-[14px] text-ink">
                        {movie.title}
                      </span>
                      <span className="font-numeric mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                        {movie.rating && <span>{movie.rating}</span>}
                        {formatDuration(movie.duration_mins) && (
                          <span>{formatDuration(movie.duration_mins)}</span>
                        )}
                        <span>{movie.showtime_count} showtimes</span>
                      </span>
                    </span>
                  </button>
                ))}
              </Section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-1">
      <h3 className="font-label px-3 pb-1 pt-1 text-[10px] uppercase tracking-widest text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

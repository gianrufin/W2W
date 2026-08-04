'use client';

import { useCallback, useMemo, useRef } from 'react';
import Map, { Marker, type MapRef, type ViewStateChangeEvent } from 'react-map-gl/maplibre';
import { Crosshair } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

import { CinemaPin } from './cinema-pin';
import { resolveMapStyle } from './map-style';
import { useDiscoveryStore } from '@/store/use-discovery-store';
import { haversineKm, isStartingSoon } from '@/lib/utils';
import type { Theme } from '@/hooks/use-theme';

interface CinemaMapProps {
  theme: Theme;
  onLocateMe: () => void;
  locating: boolean;
}

/**
 * The map is the app. It covers the viewport on every screen size; everything
 * else floats over it.
 *
 * Panning never refetches on its own — it raises "Search this area" instead.
 * Results silently changing under a thumb is disorienting, and on mobile the
 * map moves constantly just from handling the phone.
 *
 * The button itself is rendered by the shell, not here: the header floats over
 * the map in its own click-catching box, so anything the map drew underneath it
 * looked pressable but swallowed every tap. The map only reports the radius the
 * viewport covers, and the shell owns the control.
 */
export function CinemaMap({ theme, onLocateMe, locating }: CinemaMapProps) {
  const mapRef = useRef<MapRef | null>(null);

  const cinemas = useDiscoveryStore((s) => s.cinemas);
  const userCoords = useDiscoveryStore((s) => s.userCoords);
  const searchCenter = useDiscoveryStore((s) => s.searchCenter);
  const openCinemaId = useDiscoveryStore((s) => s.openCinemaId);
  const hoveredCinemaId = useDiscoveryStore((s) => s.hoveredCinemaId);
  const viewport = useDiscoveryStore((s) => s.viewport);
  const flyToken = useDiscoveryStore((s) => s.flyToken);

  const openCinema = useDiscoveryStore((s) => s.openCinema);
  const setMapMoved = useDiscoveryStore((s) => s.setMapMoved);
  const setVisibleRadius = useDiscoveryStore((s) => s.setVisibleRadius);
  const setViewport = useDiscoveryStore((s) => s.setViewport);

  const mapStyle = useMemo(() => resolveMapStyle(theme), [theme]);

  // Fly when something asks us to, rather than on every viewport change —
  // otherwise the map fights the user's own panning.
  const lastFly = useRef(flyToken);
  if (flyToken !== lastFly.current) {
    lastFly.current = flyToken;
    mapRef.current?.getMap()?.easeTo({
      center: [viewport.longitude, viewport.latitude],
      zoom: viewport.zoom,
      duration: 700,
      essential: true,
    });
  }

  /** Radius that covers what is actually on screen, so "this area" means it. */
  const visibleRadiusMeters = useCallback((): number => {
    const map = mapRef.current?.getMap();
    if (!map) return 15_000;
    const bounds = map.getBounds();
    const centre = bounds.getCenter();
    const km = haversineKm(
      { lat: centre.lat, lng: centre.lng },
      { lat: bounds.getNorth(), lng: bounds.getEast() },
    );
    // Clamped: a nationwide zoom-out should not ask Postgres for the planet.
    return Math.round(Math.min(Math.max(km * 1000, 2_000), 400_000));
  }, []);

  const onMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      const { latitude, longitude, zoom } = e.viewState;
      setViewport({ latitude, longitude, zoom });
      setVisibleRadius(visibleRadiusMeters());
      // A few hundred metres of drift is handling the phone, not a new intent.
      const drift = haversineKm({ lat: latitude, lng: longitude }, searchCenter);
      setMapMoved(drift > 1.5);
    },
    [searchCenter, setMapMoved, setViewport, setVisibleRadius, visibleRadiusMeters],
  );

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        initialViewState={{
          latitude: viewport.latitude,
          longitude: viewport.longitude,
          zoom: viewport.zoom,
        }}
        mapStyle={mapStyle}
        style={{ width: '100%', height: '100%' }}
        attributionControl={{ compact: true }}
        onMoveEnd={onMoveEnd}
        onClick={() => openCinema(null)}
        dragRotate={false}
        touchZoomRotate
        // The whole country should be reachable by pinching out.
        minZoom={4.5}
        maxZoom={18}
      >
        {userCoords && (
          <Marker latitude={userCoords.lat} longitude={userCoords.lng} anchor="center">
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary/60" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-card bg-secondary shadow-soft" />
            </span>
          </Marker>
        )}

        {cinemas.map((cinema) => (
          <Marker
            key={cinema.id}
            latitude={cinema.lat}
            longitude={cinema.lng}
            anchor="center"
            style={{ zIndex: cinema.id === openCinemaId ? 30 : 10 }}
          >
            <CinemaPin
              cinema={cinema}
              selected={cinema.id === openCinemaId}
              hovered={cinema.id === hoveredCinemaId}
              startingSoon={cinema.showtimes.some((s) => isStartingSoon(s.start_time))}
              onClick={() => openCinema(cinema.id)}
            />
          </Marker>
        ))}
      </Map>

      <button
        type="button"
        onClick={onLocateMe}
        aria-label="Find cinemas near me"
        className="glass-panel absolute bottom-6 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full text-ink shadow-float active:scale-95"
      >
        <Crosshair className={locating ? 'h-5 w-5 animate-pulse' : 'h-5 w-5'} />
      </button>
    </div>
  );
}

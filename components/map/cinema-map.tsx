'use client';

import { useMemo } from 'react';
import Map, { Marker, NavigationControl, type MapRef } from 'react-map-gl/maplibre';
import { Crosshair, Layers } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

import { CinemaPin } from './cinema-pin';
import { resolveMapStyle } from './map-style';
import { useDiscoveryStore } from '@/store/use-discovery-store';
import { isStartingSoon } from '@/lib/utils';

interface CinemaMapProps {
  mapRef: React.MutableRefObject<MapRef | null>;
  onSelectPin: (id: string) => void;
  onRecenter: () => void;
  onFitResults: () => void;
}

export function CinemaMap({ mapRef, onSelectPin, onRecenter, onFitResults }: CinemaMapProps) {
  const cinemas = useDiscoveryStore((s) => s.cinemas);
  const coords = useDiscoveryStore((s) => s.coords);
  const selectedCinemaId = useDiscoveryStore((s) => s.selectedCinemaId);
  const hoveredCinemaId = useDiscoveryStore((s) => s.hoveredCinemaId);
  const viewport = useDiscoveryStore((s) => s.viewport);
  const selectCinema = useDiscoveryStore((s) => s.selectCinema);

  const mapStyle = useMemo(() => resolveMapStyle(), []);

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
        // Tapping empty canvas clears the selection, like Airbnb's map.
        onClick={() => selectCinema(null, { fly: false })}
        dragRotate={false}
        touchZoomRotate
      >
        <NavigationControl position="top-right" showCompass={false} />

        {/* User location */}
        <Marker latitude={coords.lat} longitude={coords.lng} anchor="center">
          <span className="relative flex h-4 w-4 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400/60" />
            <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-white bg-sky-500 shadow-lg" />
          </span>
        </Marker>

        {cinemas.map((cinema) => (
          <Marker
            key={cinema.id}
            latitude={cinema.lat}
            longitude={cinema.lng}
            anchor="center"
            style={{ zIndex: cinema.id === selectedCinemaId ? 30 : 10 }}
          >
            <CinemaPin
              cinema={cinema}
              selected={cinema.id === selectedCinemaId}
              hovered={cinema.id === hoveredCinemaId}
              startingSoon={cinema.showtimes.some((s) => isStartingSoon(s.start_time))}
              onClick={() => onSelectPin(cinema.id)}
            />
          </Marker>
        ))}
      </Map>

      {/* Floating map controls — glassmorphic squircles above the canvas. */}
      {/* Sits above the bottom sheet on small screens, left of the rail on large. */}
      <div className="pointer-events-none absolute bottom-[58dvh] right-4 flex flex-col gap-2 lg:bottom-6 lg:right-[400px]">
        <button
          type="button"
          onClick={onRecenter}
          aria-label="Center on my location"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/80 text-slate-200 shadow-float backdrop-blur-xl transition hover:border-white/20 hover:text-white active:scale-95"
        >
          <Crosshair className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={onFitResults}
          aria-label="Fit all results"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/80 text-slate-200 shadow-float backdrop-blur-xl transition hover:border-white/20 hover:text-white active:scale-95"
        >
          <Layers className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}

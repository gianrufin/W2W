'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { useDiscoveryStore } from '@/store/use-discovery-store';

/**
 * Two-way binding between the map and the cinema list.
 *
 * Pin → card: selecting a pin scrolls its card into view in the carousel.
 * Card → pin: selecting or hovering a card pans the map to the pin.
 *
 * The `origin` ref is what keeps the two from fighting: a selection that came
 * from the list must not trigger the list's own scroll-into-view a second time,
 * and a pin tap must not re-issue a flyTo while the map is already animating.
 */
export function useMapSync() {
  const mapRef = useRef<MapRef | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const origin = useRef<'map' | 'list' | null>(null);

  const selectedCinemaId = useDiscoveryStore((s) => s.selectedCinemaId);
  const cinemas = useDiscoveryStore((s) => s.cinemas);
  const viewport = useDiscoveryStore((s) => s.viewport);
  const flyToken = useDiscoveryStore((s) => s.flyToken);
  const selectCinema = useDiscoveryStore((s) => s.selectCinema);
  const hoverCinema = useDiscoveryStore((s) => s.hoverCinema);

  const registerCard = useCallback((id: string, node: HTMLElement | null) => {
    if (node) cardRefs.current.set(id, node);
    else cardRefs.current.delete(id);
  }, []);

  /** Called from a map pin. */
  const selectFromMap = useCallback(
    (id: string) => {
      origin.current = 'map';
      // Don't fly — the pin is already on screen; flying just jolts the canvas.
      selectCinema(id, { fly: false });
    },
    [selectCinema],
  );

  /** Called from a cinema card. */
  const selectFromList = useCallback(
    (id: string) => {
      origin.current = 'list';
      selectCinema(id, { fly: true });
    },
    [selectCinema],
  );

  const hoverFromList = useCallback(
    (id: string | null) => {
      hoverCinema(id);
    },
    [hoverCinema],
  );

  // Pin → card: bring the selected card into view.
  useEffect(() => {
    if (!selectedCinemaId || origin.current === 'list') {
      origin.current = null;
      return;
    }
    const node = cardRefs.current.get(selectedCinemaId);
    node?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    origin.current = null;
  }, [selectedCinemaId]);

  // Card (or geolocation, or a new movie selection) → map viewport.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.easeTo({
      center: [viewport.longitude, viewport.latitude],
      zoom: viewport.zoom,
      duration: 800,
      essential: true,
    });
    // flyToken is the explicit "please move" signal; viewport alone changes on
    // every user pan and would fight the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToken]);

  /** Frame every result — used after a movie search narrows the map. */
  const fitToResults = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || cinemas.length === 0) return;

    if (cinemas.length === 1) {
      map.easeTo({ center: [cinemas[0].lng, cinemas[0].lat], zoom: 14, duration: 800 });
      return;
    }

    const lngs = cinemas.map((c) => c.lng);
    const lats = cinemas.map((c) => c.lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 140, bottom: 280, left: 60, right: 60 }, duration: 900, maxZoom: 14 },
    );
  }, [cinemas]);

  return {
    mapRef,
    listRef,
    registerCard,
    selectFromMap,
    selectFromList,
    hoverFromList,
    fitToResults,
  };
}

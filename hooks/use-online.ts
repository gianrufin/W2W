'use client';

import { useEffect } from 'react';
import { useDiscoveryStore } from '@/store/use-discovery-store';

/**
 * Keeps `store.online` in sync with the browser's own connectivity signal.
 *
 * `navigator.onLine` is a coarse "does the OS think it has a link", not "can
 * this app actually reach Supabase" — a captive portal reads as online. It is
 * still the right primary signal: the discovery query's own failure is what
 * proves the finer-grained case, and this hook exists so a *reconnect* is
 * something the app notices without the person having to touch the UI.
 */
export function useOnlineStatus() {
  const setOnline = useDiscoveryStore((s) => s.setOnline);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setOnline]);
}

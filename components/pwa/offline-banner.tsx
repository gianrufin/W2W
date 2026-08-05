'use client';

import { motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { formatShowtime } from '@/lib/utils';

/**
 * Shown only when `resultsStale` is set — meaning the schedule on screen is a
 * cached one, not a live query. Silence here would be the dishonest choice:
 * the map and the list look identical to a working app, and a plan made
 * against a schedule that quietly changed is worse than the app admitting it
 * cannot check right now.
 */
export function OfflineBanner({ fetchedAt }: { fetchedAt: string }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="glass-panel pointer-events-auto flex items-center gap-3 px-3.5 py-2.5 shadow-float"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-surface text-muted">
        <WifiOff className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-serif truncate text-[13px] text-ink">Offline</p>
        <p className="truncate text-[11px] text-muted">
          Showing cached results from {formatShowtime(fetchedAt)}
        </p>
      </div>
    </motion.div>
  );
}

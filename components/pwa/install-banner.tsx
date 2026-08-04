'use client';

import { motion } from 'framer-motion';
import { Download, X } from 'lucide-react';

/**
 * Install banner. Only rendered once the browser has actually fired
 * `beforeinstallprompt`, so it never appears where installing is impossible.
 * Dismissal is remembered.
 */
export function InstallBanner({
  onInstall,
  onDismiss,
}: {
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="glass-panel pointer-events-auto flex items-center gap-3 px-3.5 py-2.5 shadow-float"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand text-onbrand">
        <Download className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-serif truncate text-[13px] text-ink">Install W2W</p>
        <p className="truncate text-[11px] text-muted">Full screen, and it opens offline.</p>
      </div>
      <button
        type="button"
        onClick={onInstall}
        className="shrink-0 rounded-2xl bg-brand px-3 py-1.5 text-[11px] font-medium text-onbrand transition hover:brightness-110 active:scale-95"
      >
        Install
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 rounded-xl p-1 text-muted transition hover:bg-surface hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

'use client';

import { motion } from 'framer-motion';
import { MapPin, Compass, Ticket, Sparkles } from 'lucide-react';
import { BrandLogo, BrandMark } from '@/components/navigation/brand-mark';

/**
 * First-run screen.
 *
 * Its job is to earn the location prompt rather than spring it: say what the
 * permission buys before the browser dialog appears, and fire the real prompt
 * from this button's click. "Not now" is a first-class option — the map works
 * from Manila either way.
 */
export function LocationGate({
  onAllow,
  onSkip,
  locating,
}: {
  onAllow: () => void;
  onSkip: () => void;
  locating: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-bg/80 backdrop-blur-xl sm:items-center"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="w-full max-w-md rounded-t-5xl border border-hairline bg-card p-7 shadow-float sm:rounded-5xl"
      >
        <div className="flex items-center gap-2.5">
          <BrandLogo />
          <BrandMark className="text-xl" />
        </div>

        <h1 className="font-title mt-6 text-[26px] leading-tight text-ink">
          Every screening near you, right now.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          W2W opens on a live map of what is playing around you — the big chains and the
          festival and microcinema screenings nobody else lists.
        </p>

        <ul className="mt-6 space-y-3.5">
          <Benefit icon={<Compass className="h-4 w-4" />}>
            Sorts venues by how far they actually are from you
          </Benefit>
          <Benefit icon={<Sparkles className="h-4 w-4" />} tone="tertiary">
            Surfaces Cinemalaya, QCinema and cinematheque runs nearby
          </Benefit>
          <Benefit icon={<Ticket className="h-4 w-4" />}>
            Links straight to the official booking page for each showtime
          </Benefit>
        </ul>

        <button
          type="button"
          onClick={onAllow}
          disabled={locating}
          className="btn-gradient mt-7 flex w-full items-center justify-center gap-2 rounded-3xl px-4 py-3.5 text-sm font-medium transition hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
        >
          <MapPin className="h-4 w-4" />
          {locating ? 'Finding you…' : 'Use my location'}
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="mt-2 w-full rounded-3xl px-4 py-3 text-sm text-muted transition hover:bg-surface hover:text-ink active:scale-[0.98]"
        >
          Not now — browse from Manila
        </button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          Your location stays on your device. It is only used to sort and centre the map.
        </p>
      </motion.div>
    </motion.div>
  );
}

function Benefit({
  icon,
  children,
  tone = 'brand',
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: 'brand' | 'tertiary';
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={
          tone === 'tertiary'
            ? 'mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-tertiarysoft text-tertiarysoftfg'
            : 'mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-brandsoft text-brandsoftfg'
        }
      >
        {icon}
      </span>
      <span className="text-[13px] leading-relaxed text-ink">{children}</span>
    </li>
  );
}

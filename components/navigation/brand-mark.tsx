'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/** The rotating half of the wordmark. "2 Watch" is the constant. */
const WORDS = ['Where', 'When', 'What'] as const;

export function BrandMark({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % WORDS.length), 2400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={cn('flex items-center gap-1.5 select-none leading-none', className)}>
      {/* Fixed box so the swap never reflows "2 Watch"; overflow clips the slide. */}
      <span className="relative block h-[1.4em] w-[5.3ch] overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={WORDS[index]}
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '-110%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="absolute inset-0 flex items-center bg-crimson-glow bg-clip-text font-bold tracking-tight text-transparent"
          >
            {WORDS[index]}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="font-bold tracking-tight text-white">2 Watch</span>
    </div>
  );
}

/** Compact W2W lockup for tight headers. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/15 bg-crimson-glow text-[11px] font-black tracking-tighter text-white shadow-pin',
        className,
      )}
    >
      W2W
    </span>
  );
}

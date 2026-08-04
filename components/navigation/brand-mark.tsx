'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/** The rotating half of the wordmark. "2 Watch" is the constant. */
const WORDS = ['Where', 'When', 'What'] as const;

/**
 * The wordmark: a rotating question word, then "2 Watch".
 *
 * The rotating word sets its own width and "2 Watch" moves with it, so the
 * lockup breathes as the word changes rather than sitting in a fixed box sized
 * to the longest one — "Where" is five letters and "What" is four, and the
 * spacing should show it.
 *
 * `popLayout` is what makes that work: the outgoing word leaves layout flow the
 * instant it starts exiting, so the container measures only the incoming word
 * and the `layout` transition carries "2 Watch" to its new position instead of
 * jumping there.
 */
export function BrandMark({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Reduced motion still rotates the word — it cross-fades in place rather
    // than sliding and reflowing the line.
    setAnimate(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const timer = setInterval(() => setIndex((i) => (i + 1) % WORDS.length), 2600);
    return () => clearInterval(timer);
  }, []);

  const word = WORDS[index];

  return (
    <span
      // The lockup reads as one phrase; the rotation is decoration, so screen
      // readers get the whole thing at once instead of a word that keeps changing.
      role="img"
      aria-label={`${WORDS.join(', ')} 2 Watch`}
      className={cn(
        'font-title flex select-none items-baseline whitespace-nowrap leading-none tracking-[-0.02em]',
        className,
      )}
    >
      <motion.span layout={animate} className="relative inline-flex overflow-hidden py-[0.12em]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={word}
            layout={animate}
            initial={animate ? { y: '90%', opacity: 0 } : { opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={animate ? { y: '-90%', opacity: 0 } : { opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.6 }}
            className="inline-block font-bold text-brand"
          >
            {word}
          </motion.span>
        </AnimatePresence>
      </motion.span>

      {/* Em-relative, so the gap tracks the type size wherever this is used. */}
      <motion.span layout={animate} className="pl-[0.3em] font-bold text-ink">
        2 Watch
      </motion.span>
    </span>
  );
}

/** The square chip that anchors the header. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand text-[11px] font-bold tracking-tight text-onbrand shadow-soft',
        className,
      )}
    >
      W2W
    </span>
  );
}

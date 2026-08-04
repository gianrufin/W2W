'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, SlidersHorizontal, Check, X } from 'lucide-react';
import { useDiscoveryStore } from '@/store/use-discovery-store';
import { listFestivals } from '@/lib/data';
import { addDaysKey, cn, manilaDateKey } from '@/lib/utils';
import type { CategoryFilter, ScreenFormat } from '@/types';

const CATEGORIES: CategoryFilter[] = ['All', 'Mainstream', 'Indie/Festival', 'Premium'];

const QUICK_FORMATS: ScreenFormat[] = [
  'IMAX',
  'IMAX 3D',
  'Dolby Atmos',
  "Director's Club",
  '4DX',
  'A-Luxe',
  'ScreenX',
  '3D',
  '2D',
];

const RADII = [
  { label: '5 km', value: 5_000 },
  { label: '15 km', value: 15_000 },
  { label: '50 km', value: 50_000 },
  { label: 'Nationwide', value: 2_000_000 },
];

/** Category pills, date toggles, Festival Focus and the format drawer. */
export function FilterRail() {
  const category = useDiscoveryStore((s) => s.category);
  const setCategory = useDiscoveryStore((s) => s.setCategory);
  const date = useDiscoveryStore((s) => s.date);
  const setDate = useDiscoveryStore((s) => s.setDate);
  const formats = useDiscoveryStore((s) => s.formats);
  const toggleFormat = useDiscoveryStore((s) => s.toggleFormat);
  const clearFormats = useDiscoveryStore((s) => s.clearFormats);
  const festival = useDiscoveryStore((s) => s.festival);
  const setFestival = useDiscoveryStore((s) => s.setFestival);
  const radiusMeters = useDiscoveryStore((s) => s.radiusMeters);
  const setRadius = useDiscoveryStore((s) => s.setRadius);

  const [festivals, setFestivals] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    listFestivals().then(setFestivals).catch(() => setFestivals([]));
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(i));
  const today = manilaDateKey();

  return (
    <div className="mt-2.5 space-y-2.5">
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map((c) => (
          <Pill key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </Pill>
        ))}

        <span className="mx-0.5 h-5 w-px shrink-0 bg-white/10" />

        {days.map((d) => (
          <Pill key={d} active={date === d} onClick={() => setDate(d)}>
            {d === today ? 'Today' : d === days[1] ? 'Tomorrow' : shortDay(d)}
          </Pill>
        ))}

        <span className="mx-0.5 h-5 w-px shrink-0 bg-white/10" />

        <Pill
          active={drawerOpen || formats.length > 0}
          onClick={() => setDrawerOpen((o) => !o)}
          icon={<SlidersHorizontal className="h-3 w-3" />}
        >
          Formats{formats.length > 0 ? ` · ${formats.length}` : ''}
        </Pill>
      </div>

      {/* Festival Focus */}
      {festivals.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Festival focus
          </span>
          {festivals.map((f) => (
            <Pill
              key={f}
              active={festival === f}
              accent="indie"
              onClick={() => setFestival(festival === f ? null : f)}
              icon={<Sparkles className="h-3 w-3" />}
            >
              {f}
            </Pill>
          ))}
          {festival && (
            <button
              type="button"
              onClick={() => setFestival(null)}
              className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Exit festival focus"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-3 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  Experience format
                </p>
                {formats.length > 0 && (
                  <button
                    type="button"
                    onClick={clearFormats}
                    className="text-[10px] font-semibold text-crimson-400 hover:text-crimson-200"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_FORMATS.map((f) => (
                  <Pill key={f} active={formats.includes(f)} onClick={() => toggleFormat(f)}>
                    {formats.includes(f) && <Check className="mr-1 inline h-3 w-3" />}
                    {f}
                  </Pill>
                ))}
              </div>

              <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Search radius
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {RADII.map((r) => (
                  <Pill
                    key={r.value}
                    active={radiusMeters === r.value}
                    onClick={() => setRadius(r.value)}
                  >
                    {r.label}
                  </Pill>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
  icon,
  accent = 'crimson',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  accent?: 'crimson' | 'indie';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition active:scale-95',
        active
          ? accent === 'indie'
            ? 'border-indie-400/50 bg-indie-500/15 text-indie-400'
            : 'border-crimson-500/50 bg-crimson-600/15 text-crimson-200'
          : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function shortDay(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00+08:00`).toLocaleDateString('en-PH', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

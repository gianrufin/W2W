'use client';

import { Sparkles, Heart, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDiscoveryStore, type AppTab } from '@/store/use-discovery-store';

const TABS: ReadonlyArray<{ id: AppTab; label: string; icon: typeof Sparkles }> = [
  { id: 'discover', label: 'Discover', icon: Sparkles },
  { id: 'saved', label: 'Saved', icon: Heart },
  { id: 'plans', label: 'My plans', icon: Clock },
];

/**
 * Bottom navigation.
 *
 * Sits below the results sheet and owns the safe-area inset, so on a phone with
 * a home indicator the labels clear it instead of sitting under it.
 */
export function BottomNav() {
  const tab = useDiscoveryStore((s) => s.tab);
  const setTab = useDiscoveryStore((s) => s.setTab);
  const savedCount = useDiscoveryStore((s) => s.saved.length);

  return (
    <nav
      aria-label="Sections"
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 border-t border-hairline bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-xl items-stretch">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => setTab(id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-2xl transition active:scale-95',
                  active ? 'bg-surface text-ink' : 'text-muted hover:text-ink',
                )}
              >
                <span className="relative">
                  <Icon className={cn('h-[18px] w-[18px]', active && 'text-brand')} />
                  {id === 'saved' && savedCount > 0 && (
                    <span className="font-numeric absolute -right-2 -top-1.5 min-w-[14px] rounded-full bg-brand px-1 text-[9px] font-bold leading-[14px] text-onbrand">
                      {savedCount > 9 ? '9+' : savedCount}
                    </span>
                  )}
                </span>
                <span className={cn('font-label text-[10px]', active && 'font-semibold')}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

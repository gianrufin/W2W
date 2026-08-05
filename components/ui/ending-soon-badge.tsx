import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "Last day" / "Ends soon" flag on a festival screening.
 *
 * Distinct from the "Last show" quick filter, which is about tonight's final
 * screening. This is about the run itself — a festival in its closing days,
 * which is the case that actually rewards urgency: tomorrow this title may not
 * be showing anywhere at all, chain or otherwise.
 */
export function EndingSoonBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        // Gold, not red — red is reserved for failures now that it is no
        // longer the brand colour. Urgency here is a warm signal, not an error.
        'inline-flex items-center gap-1 rounded-lg border border-brand/40 bg-brandsoft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brandsoftfg',
        className,
      )}
    >
      <Flame className="h-2.5 w-2.5" />
      Ends soon
    </span>
  );
}

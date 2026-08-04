import { cn, formatBadgeClass } from '@/lib/utils';
import type { ScreenFormat } from '@/types';

/** Squircle pill tag: 2D, IMAX 3D, Dolby Atmos, Director's Club. */
export function FormatBadge({
  format,
  className,
  size = 'sm',
}: {
  format: ScreenFormat;
  className?: string;
  size?: 'xs' | 'sm';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg border font-semibold uppercase tracking-wide',
        size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]',
        formatBadgeClass(format),
        className,
      )}
    >
      {format}
    </span>
  );
}

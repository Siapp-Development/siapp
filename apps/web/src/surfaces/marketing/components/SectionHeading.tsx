import { cn } from '@siapp/ui';

import { useInViewOnce } from '../hooks/useInViewOnce.ts';

export interface ISectionHeadingProps {
  eyebrow?: string;
  title: string;
  lede?: string;
  align?: 'left' | 'center';
  /** Invert text colors for dark (primary-deep) sections. */
  onDark?: boolean;
  className?: string;
}

/** Eyebrow + h2 + lede with a one-shot reveal transition. */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = 'left',
  onDark = false,
  className,
}: ISectionHeadingProps) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-inview={inView}
      className={cn(
        'mk-reveal max-w-2xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      {eyebrow !== undefined && (
        <p
          className={cn(
            'mb-3 text-sm font-semibold tracking-wide uppercase',
            onDark ? 'text-white/70' : 'text-accent-deep',
          )}
        >
          {eyebrow}
        </p>
      )}
      <h2 className={cn('mk-h2 font-bold', onDark ? 'text-white' : 'text-foreground')}>{title}</h2>
      {lede !== undefined && (
        <p className={cn('mk-lede mt-4', onDark ? 'text-white/80' : 'text-muted-foreground')}>
          {lede}
        </p>
      )}
    </div>
  );
}

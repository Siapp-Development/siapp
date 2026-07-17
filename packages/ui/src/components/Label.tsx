import { forwardRef, type LabelHTMLAttributes } from 'react';

import { cn } from '../lib/cn.ts';

export type TLabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export const Label = forwardRef<HTMLLabelElement, TLabelProps>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <label ref={ref} className={cn('text-sm font-medium text-foreground', className)} {...props} />
  );
});

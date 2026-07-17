import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn.ts';

const alertVariants = cva('w-full rounded-md border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'border-border bg-card text-foreground',
      success: 'border-success bg-success-tint text-foreground',
      destructive: 'border-danger bg-danger-tint text-danger',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface IAlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

/** Inline callout. Defaults to role="alert"; pass role="status" for polite announcements. */
export function Alert({ className, variant, ...props }: IAlertProps) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export { alertVariants };

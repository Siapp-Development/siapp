import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn.ts';

export type TCardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: TCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card text-foreground shadow-card',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: TCardProps) {
  return <div className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
}

export function CardContent({ className, ...props }: TCardProps) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: TCardProps) {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}

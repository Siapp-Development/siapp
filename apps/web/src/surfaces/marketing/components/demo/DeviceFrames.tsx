import { cn } from '@siapp/ui';

export interface IDesktopWindowProps {
  /** Title shown in the window chrome. */
  title: string;
  className?: string;
  children: React.ReactNode;
}

/** Stylized desktop browser-window frame used to stage firm-side UI. */
export function DesktopWindow({ title, className, children }: IDesktopWindowProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-raised',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </span>
        <span className="ml-2 truncate text-xs font-medium text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

export interface IPhoneFrameProps {
  label: string;
  className?: string;
  children: React.ReactNode;
}

/** Stylized phone frame used to stage the client-side WhatsApp + portal UI. */
export function PhoneFrame({ label, className, children }: IPhoneFrameProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'overflow-hidden rounded-[1.75rem] border-[6px] border-primary-deep bg-card shadow-raised',
        className,
      )}
    >
      <div className="flex justify-center bg-primary-deep pb-1.5" aria-hidden="true">
        <span className="h-1 w-12 rounded-full bg-white/30" />
      </div>
      {children}
    </div>
  );
}

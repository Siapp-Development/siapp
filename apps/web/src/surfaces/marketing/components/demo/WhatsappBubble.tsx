import { cn } from '@siapp/ui';

export interface IWhatsappBubbleProps {
  message: string;
  timestamp?: string;
  /** Animate in (slide/fade) when true; hidden until then. */
  visible?: boolean;
  className?: string;
}

/**
 * A WhatsApp-style incoming message bubble. Rendered inside a PhoneFrame to
 * show the automatic client update. Terracotta accent marks the "moment".
 */
export function WhatsappBubble({
  message,
  timestamp = '11:42',
  visible = true,
  className,
}: IWhatsappBubbleProps) {
  return (
    <div
      className={cn(
        'max-w-[90%] transition-all duration-300 ease-out motion-reduce:transition-none',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        className,
      )}
      aria-hidden={!visible}
    >
      <div className="rounded-lg rounded-tl-none border-l-2 border-accent bg-card px-3 py-2 shadow-card">
        <p className="text-[0.8125rem] leading-snug text-foreground">{message}</p>
        <p className="mt-1 text-right text-[0.625rem] text-muted-foreground">{timestamp}</p>
      </div>
    </div>
  );
}

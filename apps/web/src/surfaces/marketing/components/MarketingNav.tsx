import { useEffect, useRef, useState } from 'react';

import { cn } from '@siapp/ui';

import siappLogoFull from '@/assets/siapp-logo-full.png';

import { CtaLink } from './CtaLink.tsx';
import { CloseIcon, MenuIcon } from './icons.tsx';

interface INavLink {
  href: string;
  label: string;
}

const NAV_LINKS: INavLink[] = [
  { href: '#product', label: 'Product' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#industries', label: 'Industries' },
  { href: '#client-portal', label: 'Client portal' },
  { href: '#faq', label: 'FAQ' },
];

/**
 * Sticky top navigation. Desktop: inline links + CTA. Mobile: disclosure
 * panel (not a modal — no focus trap needed), closed by Esc with focus
 * returned to the toggle button.
 */
export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/90 backdrop-blur">
      <nav aria-label="Main" className="mx-auto max-w-[var(--mk-container)] px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <a href="#top" className="shrink-0 rounded-md">
            <img src={siappLogoFull} alt="Siapp — home" className="h-8 w-auto" />
          </a>

          <ul className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-[var(--mk-dur-fast)] hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <CtaLink location="nav" size="md" />
          </div>

          <button
            ref={toggleRef}
            type="button"
            className="flex size-10 items-center justify-center rounded-md text-foreground md:hidden"
            aria-expanded={open}
            aria-controls="mk-mobile-menu"
            onClick={() => {
              setOpen((v) => !v);
            }}
          >
            {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>

        <div
          id="mk-mobile-menu"
          className={cn('border-t border-border pb-4 md:hidden', !open && 'hidden')}
        >
          <ul className="flex flex-col py-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block rounded-md px-3 py-3 text-base font-medium text-foreground"
                  onClick={() => {
                    setOpen(false);
                  }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <CtaLink location="mobile-menu" size="lg" className="w-full" />
        </div>
      </nav>
    </header>
  );
}

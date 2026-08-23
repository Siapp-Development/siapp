import type { ReactNode } from 'react';
import { Link } from 'react-router';

import siappLogoFull from '@/assets/siapp-logo-full.png';
import { SkipLink } from '@/components/SkipLink.tsx';

import { LEGAL_LINKS } from './legalRoutes.ts';
import './legal.css';

export interface LegalPageLayoutProps {
  /** Document title, rendered as the single <h1>. */
  title: string;
  /** Effective date, human-formatted (e.g. "22 August 2026"). */
  effective: string;
  /** Last-updated date, human-formatted. */
  updated: string;
  /** Document body: semantic <h2>/<h3>, paragraphs, lists, tables. */
  children: ReactNode;
}

/**
 * Shared chrome for every public legal page (issue #100). Provides the skip
 * link, a minimal logo-home bar (not MarketingNav, whose #anchor links only
 * work on the home page), a readable single-column <main>, and a slim footer
 * cross-linking the four legal documents plus contact. Lives on the apex
 * surface only and imports nothing from the firm/admin trees (D-036/D-037).
 */
export function LegalPageLayout({ title, effective, updated, children }: LegalPageLayoutProps) {
  return (
    <div className="legal-root min-h-screen bg-background">
      <SkipLink />
      <header className="border-b border-border bg-white/90">
        <div className="mx-auto flex h-16 max-w-[65ch] items-center px-4 sm:px-6">
          <Link to="/" className="inline-flex shrink-0 items-center rounded-md py-2">
            <img src={siappLogoFull} alt="Siapp — home" className="h-8 w-auto" />
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[65ch] px-4 py-12 sm:px-6">
        <article className="legal-prose">
          <h1>{title}</h1>
          <p className="legal-dates">
            <strong>Effective date:</strong> {effective}
            <br />
            <strong>Last updated:</strong> {updated}
          </p>
          {children}
        </article>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-[65ch] px-4 py-8 sm:px-6">
          <nav aria-label="Legal">
            <ul className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
              {LEGAL_LINKS.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="mt-4 text-sm text-muted-foreground">
            Contact:{' '}
            <a href="mailto:support@siapp.app" className="underline hover:no-underline">
              support@siapp.app
            </a>{' '}
            &middot; +1 (206) 596-7128
          </p>
        </div>
      </footer>
    </div>
  );
}

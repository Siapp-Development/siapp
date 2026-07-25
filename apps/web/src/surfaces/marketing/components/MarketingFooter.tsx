import siappLogoFull from '@/assets/siapp-logo-full.png';

const FORM_URL = import.meta.env.VITE_EARLY_ACCESS_FORM_URL;

/** Site footer: brand, pronunciation note, section links, contact. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-[var(--mk-container)] px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <img src={siappLogoFull} alt="Siapp" className="h-8 w-auto" />
            <p className="mt-3 text-sm text-muted-foreground">
              Client-facing project management for professional-services firms in Southeast Asia.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Siapp is pronounced &ldquo;syap&rdquo; — from <em lang="ms">siap</em>, Malay for
              &ldquo;done&rdquo;.
            </p>
          </div>
          <nav aria-label="Footer">
            <ul className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
              <li>
                <a href="#product" className="text-muted-foreground hover:text-foreground">
                  Product
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="text-muted-foreground hover:text-foreground">
                  How it works
                </a>
              </li>
              <li>
                <a href="#industries" className="text-muted-foreground hover:text-foreground">
                  Industries
                </a>
              </li>
              <li>
                <a href="#client-portal" className="text-muted-foreground hover:text-foreground">
                  Client portal
                </a>
              </li>
              <li>
                <a href="#faq" className="text-muted-foreground hover:text-foreground">
                  FAQ
                </a>
              </li>
              <li>
                <a
                  href={FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Contact us<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Siapp. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

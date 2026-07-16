import { useParams } from 'react-router';

import { SkipLink } from '@/components/SkipLink.tsx';

/**
 * Firm dashboard shell at dashboard.siapp.app/:workspaceSlug/* — sidebar-nav
 * skeleton, firm theme. Slug is parsed but not validated (auth is later work).
 */
export function FirmShell() {
  const { workspaceSlug } = useParams<'workspaceSlug'>();

  return (
    <div className="flex min-h-screen">
      <SkipLink />
      <aside className="w-56 border-r border-border bg-card px-4 py-6">
        <p className="text-lg font-semibold text-primary">Siapp</p>
        <nav aria-label="Workspace" className="mt-6">
          <ul className="flex flex-col gap-2">
            <li>
              <a href="#main" className="text-foreground hover:text-primary">
                Projects
              </a>
            </li>
            <li>
              <a href="#main" className="text-foreground hover:text-primary">
                Clients
              </a>
            </li>
            <li>
              <a href="#main" className="text-foreground hover:text-primary">
                Settings
              </a>
            </li>
          </ul>
        </nav>
      </aside>
      <main id="main" className="flex-1 px-8 py-10">
        <h1 className="text-2xl font-bold">
          Workspace <span className="font-mono">{workspaceSlug}</span>
        </h1>
        <p className="mt-2">Dashboard features arrive in later tickets.</p>
      </main>
    </div>
  );
}

import { useParams } from 'react-router';

import { SkipLink } from '@/components/SkipLink.tsx';
import { useSurfaceTheme } from '@/hooks/useSurfaceTheme.ts';

/**
 * Collaborator task page at siapp.app/t/:token — lazy-loaded, warm portal
 * theme. Token is parsed but not validated (auth is later work).
 */
export function CollabTaskPage() {
  const { token } = useParams<'token'>();
  useSurfaceTheme('portal');

  return (
    <>
      <SkipLink />
      <header className="border-b border-border bg-card px-6 py-4">
        <p className="text-lg font-semibold text-primary">Task</p>
      </header>
      <main id="main" className="mx-auto max-w-xl px-6 py-10">
        <h1 className="text-2xl font-bold">Your task</h1>
        <p className="mt-2">
          Task link <span className="font-mono">{token}</span> — task details and status actions
          arrive in a later ticket.
        </p>
      </main>
    </>
  );
}

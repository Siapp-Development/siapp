import { SkipLink } from '@/components/SkipLink.tsx';

/** dashboard.siapp.app/ — no workspace in the URL yet. */
export function WorkspaceEntry() {
  return (
    <>
      <SkipLink />
      <main id="main" className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-bold">Siapp Dashboard</h1>
        <p className="mt-2">
          Enter your workspace URL, e.g.{' '}
          <span className="font-mono">dashboard.siapp.app/your-workspace</span>.
        </p>
      </main>
    </>
  );
}

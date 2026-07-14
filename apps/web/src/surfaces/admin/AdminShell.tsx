import { SkipLink } from '@/components/SkipLink.tsx';

const environment = import.meta.env.MODE;

/** Siapp internal admin shell at admin.siapp.app — firm theme + env marker. */
export function AdminShell() {
  return (
    <>
      <SkipLink />
      <header className="bg-primary-deep px-6 py-2">
        <p className="text-sm font-semibold text-primary-foreground">
          Siapp Admin — {environment}
        </p>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold">Siapp Admin</h1>
        <p className="mt-2">Internal tooling arrives in later tickets.</p>
      </main>
    </>
  );
}

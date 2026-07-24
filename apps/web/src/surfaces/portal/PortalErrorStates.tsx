/**
 * Portal error/empty full-page states (#21): B1x invalid-or-expired link,
 * project not started yet, and a generic retryable failure. Each renders a
 * complete <main> because they replace the whole shell.
 */

export function PortalInvalidState() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-10">
      <h1 className="text-2xl font-bold">This link is no longer valid</h1>
      <p className="mt-3 text-muted-foreground">
        The link may have expired or been replaced. Please ask your project team to send you a new
        portal link.
      </p>
    </main>
  );
}

export function PortalNotStartedState({ firmName }: { firmName: string }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-10">
      <h1 className="text-2xl font-bold">Your project hasn&rsquo;t started yet</h1>
      <p className="mt-3 text-muted-foreground">
        {firmName !== '' ? firmName : 'Your project team'} is still preparing this project.
        Check back once they let you know it&rsquo;s underway.
      </p>
    </main>
  );
}

export function PortalErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-10">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-3 text-muted-foreground">
        We couldn&rsquo;t open your project portal. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Try again
      </button>
    </main>
  );
}

export function PortalLoadingState() {
  return (
    <main
      id="main"
      aria-busy="true"
      className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-10"
    >
      <p role="status" className="text-muted-foreground">
        Opening your project&hellip;
      </p>
    </main>
  );
}

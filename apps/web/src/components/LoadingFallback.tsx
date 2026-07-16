/** Accessible Suspense fallback for lazy route trees. */
export function LoadingFallback() {
  return (
    <p role="status" className="p-8 text-foreground">
      Loading…
    </p>
  );
}

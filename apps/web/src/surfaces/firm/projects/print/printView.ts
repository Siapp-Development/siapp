/**
 * Shared print helpers for the Projects page (#166), generalized from the
 * Timeline's proven isolation pattern. A single `<style media="print">` (see
 * `ProjectsPrintStyle`) isolates `#projects-print-root` — everything else on the
 * page is hidden — and scales the root to fit one page width for the wide
 * Table/Timeline views. The `@page` rule stays a static string literal.
 */

/** Stable id of the print region wrapping the active Projects view. */
export const PROJECTS_PRINT_ROOT_ID = 'projects-print-root';

/** CSS custom property that drives the scale-to-fit transform (top-left origin). */
export const PROJECTS_PRINT_SCALE_VAR = '--projects-print-scale';

/** Orientation of the printed page; drives the `@page size` chosen at print time. */
export type TPrintOrientation = 'portrait' | 'landscape';

/**
 * Safe landscape content width at 96dpi for A4/Letter with ~8mm margins. Wide
 * views (Table/Timeline) scale down so their full width fits one page.
 */
export const PRINT_TARGET_PX = 980;

/**
 * Compute a scale factor (0, 1] that fits `contentWidthPx` into `targetPx`,
 * never upscaling. Returns `1` when the content already fits or when the width
 * is unmeasurable (e.g. jsdom reports `0`), so tests and empty layouts are safe.
 */
export function computeScaleToFit(contentWidthPx: number, targetPx = PRINT_TARGET_PX): number {
  if (contentWidthPx <= 0 || targetPx <= 0) {
    return 1;
  }
  return Math.min(1, targetPx / contentWidthPx);
}

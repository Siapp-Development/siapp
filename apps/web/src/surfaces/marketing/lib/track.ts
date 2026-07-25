/**
 * Marketing analytics stub (impl-28 §5). No provider is wired yet — events
 * dispatch a DOM CustomEvent so a future analytics script can subscribe
 * without touching components, and log in dev for verification. No cookies,
 * no network, so no consent banner is required.
 */
export type TMarketingEvent =
  | 'early_access_cta_clicked'
  | 'product_demo_started'
  | 'product_demo_completed'
  | 'industry_view_construction'
  | 'industry_view_legal'
  | 'faq_opened'
  | 'client_portal_preview_viewed';

export function track(event: TMarketingEvent, props?: Record<string, string>): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- dev-only event visibility; the DEV guard strips this from production bundles
    console.debug('[track]', event, props ?? {});
  }
  window.dispatchEvent(new CustomEvent('siapp:track', { detail: { event, props } }));
}

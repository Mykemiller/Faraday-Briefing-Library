/**
 * Feature flags = deploy gates (Boundaries; spec §16 deploy gate; §18).
 *
 * Everything ships to a flag-gated PREVIEW route. Subscriber-live and commerce-on stay OFF
 * until the matching gate clears. Flags are read from env so flipping is a config change, not a deploy.
 *
 *   subscriberLive  ← FAR-132 (Gamma theme normalization)
 *   commerceOn      ← FAR-16  (wallet generalization) + FAR-46 (meter value sign-off)
 *
 * NEVER default these to true. Flipping to live is a Myke decision, not a code change.
 */
const truthy = (v: string | undefined, fallback = false) =>
  v === undefined ? fallback : v === "true" || v === "1";

export const flags = {
  /** Storefront is served only on the preview/staging route until launch gates clear. */
  previewRoute: truthy(process.env.NEXT_PUBLIC_LIBRARY_PREVIEW_ROUTE, true),
  /** OFF until FAR-132 lands. Gates the shelf for general subscriber exposure. */
  subscriberLive: truthy(process.env.NEXT_PUBLIC_LIBRARY_SUBSCRIBER_LIVE, false),
  /** OFF until FAR-16 + FAR-46 land. Gates cart→checkout (add/remove still render disabled). */
  commerceOn: truthy(process.env.NEXT_PUBLIC_LIBRARY_COMMERCE_ON, false),
  /** Anonymous deep-link teaser slide (§4.1). Conversion vs exclusivity — flag #6, §18. */
  anonTeaser: truthy(process.env.NEXT_PUBLIC_LIBRARY_ANON_TEASER, true),
} as const;

export type Flags = typeof flags;

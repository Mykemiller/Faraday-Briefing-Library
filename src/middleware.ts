import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk auth front. The storefront allows anonymous browsing (§4.1); route-level checks gate
// cart/checkout. Subscriber-live + commerce-on remain behind feature flags regardless.
export default clerkMiddleware();

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};

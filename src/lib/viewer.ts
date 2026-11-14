import { auth, currentUser } from "@clerk/nextjs/server";
import { subscriberIdForEmail } from "@/lib/identity";

/**
 * The Reading Room viewer (BL3-11): Clerk session → email → public.subscribers(id), the same
 * resolution the cart/checkout routes use. Anonymous, unconfigured Clerk, or any lookup failure
 * ⇒ null (a non-owner view), never an error page.
 */
export async function viewerSubscriberId(): Promise<string | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;
    const user = await currentUser();
    return await subscriberIdForEmail(user?.primaryEmailAddress?.emailAddress);
  } catch {
    return null;
  }
}

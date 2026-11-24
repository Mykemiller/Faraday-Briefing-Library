import { auth, currentUser } from "@clerk/nextjs/server";
import { subscriberIdForEmail } from "@/lib/identity";
import { verifiedClerkEmail } from "@/lib/faradayGate";

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

/**
 * The signed-in viewer's email for the masthead's context slot (FDY-449). Reads the same Clerk
 * session as viewerSubscriberId, nothing else. Anonymous, unconfigured Clerk or any failure ⇒ null
 * (the masthead then shows "Sign in").
 */
export async function viewerEmail(): Promise<string | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;
    const user = await currentUser();
    return user?.primaryEmailAddress?.emailAddress ?? null;
  } catch {
    return null;
  }
}

/**
 * One Clerk read for the /library layout (FDY-417): the masthead email (exactly what viewerEmail
 * returns) and the Clerk-VERIFIED primary email the beta access gate may trust as the app's own
 * sign-in. Anonymous, unconfigured Clerk or any failure ⇒ both null (the gate then falls back to its
 * own one-time-code cookie, and in mode "open" it reads neither).
 */
export async function viewerIdentity(): Promise<{ email: string | null; verifiedEmail: string | null }> {
  try {
    const { userId } = await auth();
    if (!userId) return { email: null, verifiedEmail: null };
    const user = await currentUser();
    return { email: user?.primaryEmailAddress?.emailAddress ?? null, verifiedEmail: verifiedClerkEmail(user) };
  } catch {
    return { email: null, verifiedEmail: null };
  }
}

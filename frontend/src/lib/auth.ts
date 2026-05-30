import { cookies } from "next/headers";

interface SessionData {
  address: string;
  chainId: number;
  issuedAt: string;
}

// Read the SIWE session cookie and return the authenticated wallet address.
// Returns null if there is no valid session.
export async function getAuthenticatedAddress(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("siwe_session")?.value;
    if (!sessionCookie) return null;

    const sessionData: SessionData = JSON.parse(
      Buffer.from(sessionCookie, "base64").toString("utf-8")
    );
    return sessionData.address ?? null;
  } catch {
    return null;
  }
}

// Read the full SIWE session payload (address, chainId, issuedAt).
// Returns null if there is no valid session.
export async function getSessionData(): Promise<SessionData | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("siwe_session")?.value;
    if (!sessionCookie) return null;

    return JSON.parse(
      Buffer.from(sessionCookie, "base64").toString("utf-8")
    ) as SessionData;
  } catch {
    return null;
  }
}

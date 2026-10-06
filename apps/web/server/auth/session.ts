import { auth } from "@/auth";

/** The NOVA user id carried by the current session token, if there is one. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

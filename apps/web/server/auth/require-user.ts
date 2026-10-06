import { getDb, getUserById } from "@nova/database";
import type { User } from "@nova/types";
import { HttpError } from "../http";
import { getSessionUserId } from "./session";

/** The only way a route or page obtains the current user. Throws UNAUTHENTICATED when there is none. */
export async function requireUser(): Promise<User> {
  const userId = await getSessionUserId();
  if (!userId) throw new HttpError("UNAUTHENTICATED");
  // A valid token can outlive its account; treat that the same as no session.
  const user = await getUserById(getDb(), userId);
  if (!user) throw new HttpError("UNAUTHENTICATED");
  return user;
}

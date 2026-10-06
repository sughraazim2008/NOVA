import type { User } from "@nova/types";
import { redirect } from "next/navigation";
import { HttpError } from "../http";
import { requireUser } from "./require-user";

/** For pages: the signed-in user, or a redirect to the sign-in screen. */
export async function pageUser(): Promise<User> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof HttpError && error.code === "UNAUTHENTICATED") redirect("/signin");
    throw error;
  }
}

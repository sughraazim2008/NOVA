import { requireUser } from "@/server/auth/require-user";
import { json, route } from "@/server/http";
import { getProgress } from "@/server/services/progress";

/** Sparks, level, momentum and badges, derived from the user's history. */
export const GET = route(async () => json(await getProgress(await requireUser())));

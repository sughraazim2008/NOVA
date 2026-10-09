import { DecomposeRequestSchema } from "@nova/types";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { decompose } from "@/server/services/decomposition";

// A decomposition is four model calls in a row, usually 10 to 20 seconds in total.
export const maxDuration = 60;

/** Sentence → draft goal, milestones and tasks. Saves nothing; the draft goes back for review. */
export const POST = route(async (request) => {
  const user = await requireUser();
  const input = await readJson(request, DecomposeRequestSchema);
  rateLimit(user.id, "decompose", 6);
  return json(await decompose(user, input));
});

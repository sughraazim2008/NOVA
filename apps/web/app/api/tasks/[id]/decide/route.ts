import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import { decideKeep } from "@/server/services/replanning";

const BodySchema = z.object({ choice: z.enum(["KEEP", "NEXT_WEEK", "DROP"]) });

/** Keep, move to next week, or drop: the answer to "does this task still matter?". */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const user = await requireUser();
  const { choice } = await readJson(request, BodySchema);
  return json(await decideKeep(user, id, choice));
});

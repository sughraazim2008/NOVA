import { FrictionReasonSchema } from "@nova/types";
import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { respondToFriction } from "@/server/services/replanning";

const BodySchema = z.object({ reason: FrictionReasonSchema, note: z.string().trim().max(300).optional() });

export const maxDuration = 60;

/** Records what got in the way of a task, and replans in response. */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const user = await requireUser();
  const input = await readJson(request, BodySchema);
  rateLimit(user.id, "friction", 30);
  return json(await respondToFriction(user, id, input), 201);
});

import { FrictionReasonSchema } from "@nova/types";
import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import { reportFriction } from "@/server/services/behaviour";

const BodySchema = z.object({ reason: FrictionReasonSchema, note: z.string().trim().max(300).optional() });

/** Records what got in the way of a task. */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const user = await requireUser();
  return json(await reportFriction(user, id, await readJson(request, BodySchema)), 201);
});

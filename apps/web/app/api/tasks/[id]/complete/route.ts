import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import { json, route } from "@/server/http";
import { completeTask } from "@/server/services/execution";

const BodySchema = z.object({ actualMin: z.number().int().min(0).max(1440).optional() });

export const POST = route<{ id: string }>(async (request, { id }) => {
  const user = await requireUser();
  // The body is optional: a bare POST simply marks the task done.
  const { actualMin } = BodySchema.parse(await request.json().catch(() => ({})));
  return json(await completeTask(user, id, actualMin));
});

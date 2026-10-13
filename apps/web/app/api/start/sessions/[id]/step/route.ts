import { StepActionSchema } from "@nova/types";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { stepAction } from "@/server/services/start";

export const maxDuration = 60;

/** Done, skip, or "I'm stuck" on the step being shown. */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const user = await requireUser();
  const input = await readJson(request, StepActionSchema);
  if (input.action === "stuck") rateLimit(user.id, "stuck", 20);
  return json(await stepAction(user, id, input));
});

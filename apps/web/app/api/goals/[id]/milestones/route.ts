import { CreateMilestoneInputSchema } from "@nova/types";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import * as goals from "@/server/services/goals";

export const POST = route<{ id: string }>(async (request, { id }) => {
  const user = await requireUser();
  const input = await readJson(request, CreateMilestoneInputSchema);
  return json(await goals.createMilestone(user, id, input), 201);
});

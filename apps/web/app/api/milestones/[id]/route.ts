import { UpdateMilestoneInputSchema } from "@nova/types";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import * as goals from "@/server/services/goals";

type Params = { id: string };

export const PATCH = route<Params>(async (request, { id }) => {
  const user = await requireUser();
  const input = await readJson(request, UpdateMilestoneInputSchema);
  return json(await goals.updateMilestone(user, id, input));
});

export const DELETE = route<Params>(async (_request, { id }) => {
  const user = await requireUser();
  await goals.deleteMilestone(user, id);
  return json({ deleted: true });
});

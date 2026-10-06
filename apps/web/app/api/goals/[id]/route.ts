import { UpdateGoalInputSchema } from "@nova/types";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import * as goals from "@/server/services/goals";

type Params = { id: string };

export const GET = route<Params>(async (_request, { id }) => {
  const user = await requireUser();
  return json(await goals.getGoalTree(user, id));
});

export const PATCH = route<Params>(async (request, { id }) => {
  const user = await requireUser();
  const input = await readJson(request, UpdateGoalInputSchema);
  return json(await goals.updateGoal(user, id, input));
});

export const DELETE = route<Params>(async (_request, { id }) => {
  const user = await requireUser();
  await goals.deleteGoal(user, id);
  return json({ deleted: true });
});

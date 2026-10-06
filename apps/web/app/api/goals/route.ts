import { CreateGoalInputSchema, GoalStatusSchema } from "@nova/types";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import * as goals from "@/server/services/goals";

export const GET = route(async (request) => {
  const user = await requireUser();
  const status = new URL(request.url).searchParams.get("status");
  return json(await goals.listGoals(user, status === null ? undefined : GoalStatusSchema.parse(status)));
});

export const POST = route(async (request) => {
  const user = await requireUser();
  const input = await readJson(request, CreateGoalInputSchema);
  return json(await goals.createGoal(user, input), 201);
});

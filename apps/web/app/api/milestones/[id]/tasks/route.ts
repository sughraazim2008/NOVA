import { CreateTaskInputSchema } from "@nova/types";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import * as tasks from "@/server/services/tasks";

export const POST = route<{ id: string }>(async (request, { id }) => {
  const user = await requireUser();
  const input = await readJson(request, CreateTaskInputSchema);
  return json(await tasks.createTask(user, id, input), 201);
});

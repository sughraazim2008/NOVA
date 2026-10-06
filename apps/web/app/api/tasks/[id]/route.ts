import { UpdateTaskInputSchema } from "@nova/types";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import * as tasks from "@/server/services/tasks";

type Params = { id: string };

export const GET = route<Params>(async (_request, { id }) => {
  const user = await requireUser();
  return json(await tasks.getTask(user, id));
});

export const PATCH = route<Params>(async (request, { id }) => {
  const user = await requireUser();
  const input = await readJson(request, UpdateTaskInputSchema);
  return json(await tasks.updateTask(user, id, input));
});

export const DELETE = route<Params>(async (_request, { id }) => {
  const user = await requireUser();
  await tasks.deleteTask(user, id);
  return json({ deleted: true });
});

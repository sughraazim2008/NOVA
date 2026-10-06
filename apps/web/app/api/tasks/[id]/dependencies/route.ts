import { IdSchema } from "@nova/types";
import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import * as tasks from "@/server/services/tasks";

type Params = { id: string };

const BodySchema = z.object({ dependsOnTaskId: IdSchema });

/** Declares that this task cannot start until `dependsOnTaskId` is finished. */
export const POST = route<Params>(async (request, { id }) => {
  const user = await requireUser();
  const { dependsOnTaskId } = await readJson(request, BodySchema);
  return json(await tasks.addDependency(user, { taskId: id, dependsOnTaskId }), 201);
});

export const DELETE = route<Params>(async (request, { id }) => {
  const user = await requireUser();
  const { dependsOnTaskId } = await readJson(request, BodySchema);
  await tasks.removeDependency(user, { taskId: id, dependsOnTaskId });
  return json({ deleted: true });
});

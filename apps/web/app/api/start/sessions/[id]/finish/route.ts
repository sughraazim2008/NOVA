import { FinishSessionSchema } from "@nova/types";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import { finishSession } from "@/server/services/start";

export const POST = route<{ id: string }>(async (request, { id }) => {
  const user = await requireUser();
  const { outcome } = await readJson(request, FinishSessionSchema);
  return json(await finishSession(user, id, outcome));
});

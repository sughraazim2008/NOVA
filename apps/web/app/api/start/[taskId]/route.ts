import { requireUser } from "@/server/auth/require-user";
import { json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { openSession } from "@/server/services/start";

export const maxDuration = 60;

/** Opens a NOVA START session for the task, or returns the one already open. */
export const POST = route<{ taskId: string }>(async (_request, { taskId }) => {
  const user = await requireUser();
  rateLimit(user.id, "start", 20);
  return json(await openSession(user, taskId));
});

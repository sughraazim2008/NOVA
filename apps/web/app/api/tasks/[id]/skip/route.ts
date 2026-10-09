import { requireUser } from "@/server/auth/require-user";
import { json, route } from "@/server/http";
import { skipTask } from "@/server/services/execution";

export const POST = route<{ id: string }>(async (_request, { id }) => json(await skipTask(await requireUser(), id)));

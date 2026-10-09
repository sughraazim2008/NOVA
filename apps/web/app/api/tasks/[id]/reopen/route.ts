import { requireUser } from "@/server/auth/require-user";
import { json, route } from "@/server/http";
import { reopenTask } from "@/server/services/execution";

export const POST = route<{ id: string }>(async (_request, { id }) => json(await reopenTask(await requireUser(), id)));

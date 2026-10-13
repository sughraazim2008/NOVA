import { requireUser } from "@/server/auth/require-user";
import { json, route } from "@/server/http";
import { getSession } from "@/server/services/start";

export const GET = route<{ id: string }>(async (_request, { id }) => json(await getSession(await requireUser(), id)));

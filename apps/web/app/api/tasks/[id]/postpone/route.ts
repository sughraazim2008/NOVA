import { IsoDateSchema } from "@nova/types";
import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import { json, route } from "@/server/http";
import { postponeTask } from "@/server/services/execution";

const BodySchema = z.object({ toDate: IsoDateSchema.optional() });

export const POST = route<{ id: string }>(async (request, { id }) => {
  const user = await requireUser();
  const { toDate } = BodySchema.parse(await request.json().catch(() => ({})));
  return json(await postponeTask(user, id, toDate));
});

import { getDb, updateUser } from "@nova/database";
import { UpdateUserInputSchema } from "@nova/types";
import { requireUser } from "@/server/auth/require-user";
import { found, json, readJson, route } from "@/server/http";

export const GET = route(async () => json(await requireUser()));

export const PATCH = route(async (request) => {
  const user = await requireUser();
  const input = await readJson(request, UpdateUserInputSchema);
  return json(found(await updateUser(getDb(), user.id, input)));
});

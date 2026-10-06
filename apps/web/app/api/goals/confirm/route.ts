import { ConfirmDraftRequestSchema } from "@nova/types";
import { requireUser } from "@/server/auth/require-user";
import { json, readJson, route } from "@/server/http";
import { confirm } from "@/server/services/decomposition";

/** Saves a reviewed draft. Everything is validated again; nothing from the browser is trusted. */
export const POST = route(async (request) => {
  const user = await requireUser();
  const input = await readJson(request, ConfirmDraftRequestSchema);
  return json(await confirm(user, input), 201);
});

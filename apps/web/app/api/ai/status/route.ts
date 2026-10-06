import { requireUser } from "@/server/auth/require-user";
import { json, route } from "@/server/http";
import { aiStatus } from "@/server/services/decomposition";

export const GET = route(async () => {
  await requireUser();
  return json(aiStatus());
});

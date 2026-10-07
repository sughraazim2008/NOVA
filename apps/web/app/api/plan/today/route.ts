import { requireUser } from "@/server/auth/require-user";
import { json, route } from "@/server/http";
import { getTodayPlan } from "@/server/services/planning";

/** Today's plan, generated on first request. The LLM is not involved at any point. */
export const GET = route(async () => json(await getTodayPlan(await requireUser())));

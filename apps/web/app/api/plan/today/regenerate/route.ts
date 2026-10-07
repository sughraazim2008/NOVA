import { requireUser } from "@/server/auth/require-user";
import { json, route } from "@/server/http";
import { regenerateTodayPlan } from "@/server/services/planning";

/** Rebuilds today's plan, keeping whatever was already completed, skipped or postponed today. */
export const POST = route(async () => json(await regenerateTodayPlan(await requireUser())));

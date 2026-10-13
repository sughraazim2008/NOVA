import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import { json, route } from "@/server/http";
import { behaviourSummary } from "@/server/services/behaviour";

const DaysSchema = z.coerce.number().int().min(1).max(365).default(30);

/** Counts of what happened, and estimate against actual, over the last `days` days (default 30). */
export const GET = route(async (request) => {
  const user = await requireUser();
  const days = DaysSchema.parse(new URL(request.url).searchParams.get("days") ?? undefined);
  return json(await behaviourSummary(user, days));
});

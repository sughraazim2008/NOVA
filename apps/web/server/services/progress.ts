import { computeProgress, type Progress } from "@nova/behaviour";
import * as database from "@nova/database";
import { getDb } from "@nova/database";
import type { GameMode, User } from "@nova/types";
import { todayIn } from "../clock";

export interface ProgressView extends Progress {
  gameMode: GameMode;
}

/**
 * The game state for a user, recomputed from their whole history on every request. Nothing about
 * it is stored, so changing a rule changes everyone's numbers consistently. If histories grow
 * large enough for this to be slow, a cache can sit in front of it without changing the model.
 */
export async function getProgress(user: User, now: Date = new Date()): Promise<ProgressView> {
  const db = getDb();
  const [events, sessions] = await Promise.all([database.listEvents(db, user.id), database.listStartSessions(db, user.id)]);
  return { ...computeProgress({ events, sessions, today: todayIn(user.timezone, now), timezone: user.timezone }), gameMode: user.gameMode };
}

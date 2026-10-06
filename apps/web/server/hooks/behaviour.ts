import type { Db } from "@nova/database";
import type { Task, User } from "@nova/types";

// Behaviour hooks. Each is called in the same transaction as the state change it reports.
// They record nothing until Phase 8, which fills them in without touching the callers.

/** Phase 8: record TASK_CREATED. */
export async function onTaskCreated(_db: Db, _user: User, _task: Task): Promise<void> {}

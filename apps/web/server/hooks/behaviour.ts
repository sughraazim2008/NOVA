import type { Db } from "@nova/database";
import type { Task, User } from "@nova/types";

// Behaviour hooks. Each is called in the same transaction as the state change it reports.
// They record nothing until Phase 8, which fills them in without touching the callers.

/** Phase 8: record TASK_CREATED. */
export async function onTaskCreated(_db: Db, _user: User, _task: Task): Promise<void> {}

/** Phase 8: record TASK_STARTED. */
export async function onTaskStarted(_db: Db, _user: User, _task: Task): Promise<void> {}

/** Phase 8: record TASK_COMPLETED, and ESTIMATE_OVERRUN or ESTIMATE_UNDERRUN when the time was far off. */
export async function onTaskCompleted(_db: Db, _user: User, _task: Task): Promise<void> {}

/** Phase 8: record TASK_SKIPPED. */
export async function onTaskSkipped(_db: Db, _user: User, _task: Task): Promise<void> {}

/** Phase 8: record TASK_POSTPONED. */
export async function onTaskPostponed(_db: Db, _user: User, _task: Task): Promise<void> {}

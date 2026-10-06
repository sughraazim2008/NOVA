import { TaskDependencySchema, err, ok, type Result, type TaskDependency } from "@nova/types";
import { inTransaction, type Db } from "../client";

export type AddDependencyError = "SELF_REFERENCE" | "TASK_NOT_FOUND" | "CYCLE";

/** True when `to` is reachable from `from` by following "depends on" edges. */
function reaches(edges: TaskDependency[], from: string, to: string): boolean {
  const dependsOn = new Map<string, string[]>();
  for (const edge of edges) {
    const list = dependsOn.get(edge.taskId) ?? [];
    list.push(edge.dependsOnTaskId);
    dependsOn.set(edge.taskId, list);
  }
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(dependsOn.get(current) ?? []));
  }
  return false;
}

/**
 * Records that `taskId` cannot start until `dependsOnTaskId` is finished.
 *
 * Ownership and acyclicity cannot be expressed as database constraints, so they are checked
 * here, in the same transaction as the insert. A per-user advisory lock stops two concurrent
 * inserts from each passing the check and together forming a cycle.
 */
export async function addDependency(
  db: Db,
  userId: string,
  input: TaskDependency,
): Promise<Result<TaskDependency, AddDependencyError>> {
  const parsed = TaskDependencySchema.safeParse(input);
  if (!parsed.success) return err("SELF_REFERENCE");
  const { taskId, dependsOnTaskId } = parsed.data;

  return inTransaction(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const owned = await tx.task.count({ where: { id: { in: [taskId, dependsOnTaskId] }, goal: { userId } } });
    if (owned !== 2) return err("TASK_NOT_FOUND");

    const edges = await tx.taskDependency.findMany({
      where: { task: { goal: { userId } } },
      select: { taskId: true, dependsOnTaskId: true },
    });
    // The new edge closes a loop if the prerequisite already depends, directly or not, on the task.
    if (reaches(edges, dependsOnTaskId, taskId)) return err("CYCLE");

    await tx.taskDependency.upsert({
      where: { taskId_dependsOnTaskId: { taskId, dependsOnTaskId } },
      create: { taskId, dependsOnTaskId },
      update: {},
    });
    return ok({ taskId, dependsOnTaskId });
  });
}

export async function removeDependency(db: Db, userId: string, input: TaskDependency): Promise<boolean> {
  const { count } = await db.taskDependency.deleteMany({
    where: { taskId: input.taskId, dependsOnTaskId: input.dependsOnTaskId, task: { goal: { userId } } },
  });
  return count > 0;
}

export async function listDependencies(
  db: Db,
  userId: string,
  filter: { goalId?: string } = {},
): Promise<TaskDependency[]> {
  return db.taskDependency.findMany({
    where: { task: { goalId: filter.goalId, goal: { userId } } },
    select: { taskId: true, dependsOnTaskId: true },
    orderBy: [{ taskId: "asc" }, { dependsOnTaskId: "asc" }],
  });
}

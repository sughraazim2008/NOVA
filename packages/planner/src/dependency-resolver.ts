import type { TaskStatus } from "@nova/types";
import { PlannerInputError, type PlannerDependency } from "./types";

interface GraphTask {
  id: string;
  status: TaskStatus;
}

export interface TaskGraph {
  /** Task ids in a stable (alphabetical) order. */
  ids: string[];
  status: Map<string, TaskStatus>;
  /** task → the tasks it depends on (its prerequisites). */
  prerequisites: Map<string, string[]>;
  /** task → the tasks that depend on it. */
  dependents: Map<string, string[]>;
}

/** A finished task no longer blocks anything. A dropped prerequisite must not block what follows forever. */
export const isFinished = (status: TaskStatus): boolean => status === "DONE" || status === "DROPPED";

/** Builds adjacency lists in both directions. Throws on duplicate ids, unknown tasks and self-dependencies. */
export function buildGraph(tasks: GraphTask[], dependencies: PlannerDependency[]): TaskGraph {
  const status = new Map<string, TaskStatus>();
  for (const task of tasks) {
    if (status.has(task.id)) throw new PlannerInputError("DUPLICATE_ID", `Task "${task.id}" appears twice.`);
    status.set(task.id, task.status);
  }
  const ids = [...status.keys()].sort();
  const prerequisites = new Map<string, string[]>(ids.map((id) => [id, []]));
  const dependents = new Map<string, string[]>(ids.map((id) => [id, []]));

  // Sorted so that the graph, and everything derived from it, is the same whatever order the input arrived in.
  const edges = [...dependencies].sort((a, b) => a.taskId.localeCompare(b.taskId) || a.dependsOnTaskId.localeCompare(b.dependsOnTaskId));
  for (const { taskId, dependsOnTaskId } of edges) {
    if (taskId === dependsOnTaskId) throw new PlannerInputError("SELF_DEPENDENCY", `Task "${taskId}" depends on itself.`);
    for (const id of [taskId, dependsOnTaskId]) {
      if (!status.has(id)) throw new PlannerInputError("UNKNOWN_TASK", `A dependency refers to task "${id}", which is not in the input.`);
    }
    const list = prerequisites.get(taskId) as string[];
    if (list.includes(dependsOnTaskId)) continue;
    list.push(dependsOnTaskId);
    (dependents.get(dependsOnTaskId) as string[]).push(taskId);
  }
  return { ids, status, prerequisites, dependents };
}

/** Returns the ids forming a cycle (first id repeated at the end), or null. */
export function detectCycle(graph: TaskGraph): string[] | null {
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];

  const visit = (id: string): string[] | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...path.slice(path.indexOf(id)), id];
    state.set(id, "visiting");
    path.push(id);
    for (const next of graph.prerequisites.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(id, "done");
    return null;
  };

  for (const id of graph.ids) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

/** Prerequisites before the tasks that need them; ties in alphabetical order. Throws if there is a cycle. */
export function topologicalOrder(graph: TaskGraph): string[] {
  const cycle = detectCycle(graph);
  if (cycle) throw new PlannerInputError("CYCLE", `These tasks wait on each other in a loop: ${cycle.join(" → ")}.`);

  const waiting = new Map(graph.ids.map((id) => [id, (graph.prerequisites.get(id) ?? []).length]));
  const ready = graph.ids.filter((id) => waiting.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const dependent of graph.dependents.get(id) ?? []) {
      const left = (waiting.get(dependent) as number) - 1;
      waiting.set(dependent, left);
      if (left === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  return order;
}

/** True when every prerequisite of the task is finished. */
export function isUnblocked(graph: TaskGraph, taskId: string): boolean {
  return (graph.prerequisites.get(taskId) ?? []).every((id) => isFinished(graph.status.get(id) as TaskStatus));
}

/** Unfinished tasks whose prerequisites are all finished. */
export function getUnblockedTasks(graph: TaskGraph): string[] {
  return graph.ids.filter((id) => !isFinished(graph.status.get(id) as TaskStatus) && isUnblocked(graph, id));
}

/** How many distinct unfinished tasks depend on this one, directly or through a chain. */
export function countDownstream(graph: TaskGraph, taskId: string): number {
  const seen = new Set<string>();
  const stack = [...(graph.dependents.get(taskId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(graph.dependents.get(id) ?? []));
  }
  let count = 0;
  for (const id of seen) if (!isFinished(graph.status.get(id) as TaskStatus)) count += 1;
  return count;
}

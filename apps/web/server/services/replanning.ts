import { rewriteTask, type TaskRewrite } from "@nova/ai";
import * as database from "@nova/database";
import { getDb, inTransaction, lockUser, type Db } from "@nova/database";
import { addDays, decideReplan, type ReplanDecision } from "@nova/planner";
import type { FrictionEvent, FrictionReason, ReplanActionType, Task, User } from "@nova/types";
import { aiDeps, getLLM } from "../ai";
import { todayIn } from "../clock";
import { onFrictionReported, onTaskCreated } from "../hooks/behaviour";
import { found } from "../http";
import { regenerateTodayPlan } from "./planning";

// Adaptive replanning: the response to "what got in the way?". The decision is made by the pure
// rules in @nova/planner; this file carries it out on the task graph, in one transaction, and
// says plainly what changed. The model is only used to reword a task, and only that wording is taken from it.

export interface ReplanOutcome {
  action: ReplanActionType | null;
  /** One sentence for the user saying what NOVA did. */
  message: string;
  /** True when NOVA is asking whether the task still matters; nothing has been changed. */
  askToKeep: boolean;
  createdTaskIds: string[];
}

const MAX_TITLE = 200;
const withSuffix = (title: string, suffix: string) => `${title.slice(0, MAX_TITLE - suffix.length)}${suffix}`;
const withPrefix = (prefix: string, title: string) => `${prefix}${title}`.slice(0, MAX_TITLE);

async function createFollowOn(tx: Db, user: User, task: Task, title: string, estimatedMin: number): Promise<Task> {
  const created = found(
    await database.createTask(tx, user.id, task.milestoneId, {
      title,
      estimatedMin,
      priority: task.priority,
      category: task.category,
      energyDemand: task.energyDemand,
      origin: "SPLIT",
      parentTaskId: task.id,
      ...(task.deadline ? { deadline: task.deadline } : {}),
    }),
  );
  await onTaskCreated(tx, user, created);
  return created;
}

async function apply(tx: Db, user: User, task: Task, decision: ReplanDecision, rewrite: TaskRewrite | null): Promise<ReplanOutcome> {
  const none = (message: string): ReplanOutcome => ({ action: null, message, askToKeep: false, createdTaskIds: [] });

  switch (decision.action) {
    case "SHRINK": {
      await database.updateTask(tx, user.id, task.id, { estimatedMin: decision.starterMin });
      const rest = await createFollowOn(tx, user, task, withPrefix("Finish: ", task.title), decision.remainderMin);
      // The work now ends in the follow-on, so whatever waited for the task waits for that instead.
      await database.repointDependents(tx, user.id, task.id, rest.id);
      const linked = await database.addDependency(tx, user.id, { taskId: rest.id, dependsOnTaskId: task.id });
      if (!linked.ok) throw new Error(`replan: could not link the follow-on (${linked.error})`);
      return {
        action: "SHRINK",
        message: `Shrunk to a ${decision.starterMin}-minute start. The other ${decision.remainderMin} minutes are now a separate task that comes after it.`,
        askToKeep: false,
        createdTaskIds: [rest.id],
      };
    }
    case "SPLIT": {
      const parts = decision.partsMin;
      await database.updateTask(tx, user.id, task.id, { estimatedMin: parts[0] as number, title: withSuffix(task.title, ` (part 1 of ${parts.length})`) });
      const created: string[] = [];
      for (const [index, minutes] of parts.slice(1).entries()) {
        created.push((await createFollowOn(tx, user, task, withSuffix(task.title, ` (part ${index + 2} of ${parts.length})`), minutes)).id);
      }
      // Move whatever waited for the whole task onto the last part *before* chaining the parts:
      // done the other way round, the second part (which waits for the first) would be moved too,
      // and the parts would end up waiting on each other in a loop.
      const last = created.at(-1) as string;
      await database.repointDependents(tx, user.id, task.id, last);
      let previous = task.id;
      for (const id of created) {
        const linked = await database.addDependency(tx, user.id, { taskId: id, dependsOnTaskId: previous });
        if (!linked.ok) throw new Error(`replan: could not chain split parts (${linked.error})`);
        previous = id;
      }
      return {
        action: "SPLIT",
        message: `Split into ${parts.length} parts of about ${parts[0]} minutes, one per sitting.`,
        askToKeep: false,
        createdTaskIds: created,
      };
    }
    case "RETIME":
      await database.updateTask(tx, user.id, task.id, { status: "DEFERRED", deferredUntil: decision.until });
      return { action: "RETIME", message: "Moved to tomorrow. Lighter work comes first today.", askToKeep: false, createdTaskIds: [] };
    case "REWRITE":
      if (!rewrite) return none("NOVA couldn't reword it automatically this time. Open the goal and say in the title exactly what to produce.");
      await database.updateTask(tx, user.id, task.id, { title: rewrite.title, description: rewrite.description });
      return { action: "REWRITE", message: `Reworded as: "${rewrite.title}".`, askToKeep: false, createdTaskIds: [] };
    case "MICRO_ACTIONS":
      return {
        action: "MICRO_ACTIONS",
        message: "Next time you press Start, the first steps will be smaller and more obvious.",
        askToKeep: false,
        createdTaskIds: [],
      };
    case "DROP_SUGGESTED":
      return { action: "DROP_SUGGESTED", message: "Does this task still matter?", askToKeep: true, createdTaskIds: [] };
  }
}

export interface FrictionResponse {
  friction: FrictionEvent;
  replan: ReplanOutcome;
}

/**
 * Records what got in the way and responds to it: shrink, split, move, reword, or ask whether it
 * still matters. Everything is written together, and today's plan is rebuilt if the work changed.
 */
export async function respondToFriction(
  user: User,
  taskId: string,
  input: { reason: FrictionReason; note?: string | undefined },
  now: Date = new Date(),
): Promise<FrictionResponse> {
  const db = getDb();
  const today = todayIn(user.timezone, now);
  const task = found(await database.getTask(db, user.id, taskId));
  const goal = found(await database.getGoal(db, user.id, task.goalId));
  const previousSameReason = (await database.listFriction(db, user.id, { taskId })).filter((event) => event.reason === input.reason).length;

  // A finished or dropped task needs nothing changed; the answer is still worth keeping.
  const open = task.status !== "DONE" && task.status !== "DROPPED";
  const decision = open ? decideReplan({ task, reason: input.reason, previousSameReason, today }) : null;

  // The slow model call happens before the transaction, so nothing is held open while waiting.
  let rewrite: TaskRewrite | null = null;
  const llm = getLLM();
  if (decision?.action === "REWRITE" && llm) {
    const result = await rewriteTask({ goalTitle: goal.title, task, note: input.note ?? null }, aiDeps(llm));
    if (result.ok) rewrite = result.value;
  }

  const response = await inTransaction(db, async (tx) => {
    await lockUser(tx, user.id);
    const friction = found(await database.recordFriction(tx, user.id, { taskId, reason: input.reason, note: input.note ?? null, occurredAt: now.toISOString() }));
    await onFrictionReported(tx, user, task, { reason: input.reason, hasNote: Boolean(input.note?.trim()) }, now);

    const replan = decision ? await apply(tx, user, task, decision, rewrite) : { action: null, message: "Thanks. That's noted.", askToKeep: false, createdTaskIds: [] };
    if (replan.action) {
      await database.setFrictionAction(tx, user.id, friction.id, replan.action);
      await database.recordEvent(tx, user.id, {
        type: "REPLAN_APPLIED",
        taskId,
        goalId: task.goalId,
        occurredAt: now.toISOString(),
        payload: { actions: [{ taskId, action: replan.action, frictionReason: input.reason }] },
      });
    }
    return { friction: { ...friction, appliedAction: replan.action }, replan };
  });

  if (["SHRINK", "SPLIT", "RETIME", "REWRITE"].includes(response.replan.action ?? "")) await regenerateTodayPlan(user);
  return response;
}

/** The user's answer to "does this still matter?". Dropping is always their decision, never NOVA's. */
export async function decideKeep(user: User, taskId: string, choice: "KEEP" | "NEXT_WEEK" | "DROP", now: Date = new Date()): Promise<Task> {
  const today = todayIn(user.timezone, now);
  const task = await inTransaction(getDb(), async (tx) => {
    const current = found(await database.getTask(tx, user.id, taskId));
    if (choice === "KEEP") return current;
    const updated = found(
      await database.updateTask(tx, user.id, taskId, choice === "DROP" ? { status: "DROPPED" } : { status: "DEFERRED", deferredUntil: addDays(today, 7) }),
    );
    await database.recordEvent(tx, user.id, {
      type: "REPLAN_APPLIED",
      taskId,
      goalId: current.goalId,
      occurredAt: now.toISOString(),
      payload: { actions: [{ taskId, action: choice === "DROP" ? "DROP_SUGGESTED" : "DEFER", frictionReason: null }] },
    });
    return updated;
  });
  if (choice !== "KEEP") await regenerateTodayPlan(user);
  return task;
}

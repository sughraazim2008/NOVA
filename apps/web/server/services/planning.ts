import * as database from "@nova/database";
import { getDb } from "@nova/database";
import { capacityForDate, generateDailyPlan, type ExcludedTask, type PlannerInput, type PlannerOutput } from "@nova/planner";
import type { DailyPlan, DailyTask, Goal, IsoDate, Task, User } from "@nova/types";
import { todayIn } from "../clock";

export interface PlanEntry extends DailyTask {
  task: Task;
  goal: Pick<Goal, "id" | "title">;
}

export interface TodayPlan {
  date: IsoDate;
  /** Minutes NOVA could plan for the whole day, including what is already done. */
  capacityMin: number;
  usedMin: number;
  plannerVersion: string;
  generatedAt: string;
  entries: PlanEntry[];
  /** Tasks too long to fit any day as they stand; shown so the user can split them. */
  needsSplit: { task: Task; goal: Pick<Goal, "id" | "title"> }[];
  /** Why the plan is empty, when it is. */
  emptyReason: "NO_GOALS" | "NO_CAPACITY" | "NOTHING_ELIGIBLE" | "ALL_DONE" | null;
}

interface Loaded {
  goals: Goal[];
  tasks: database.TaskWithMilestoneDate[];
  input: PlannerInput;
  /** Capacity for the whole day, before subtracting what was already done. */
  dayCapacityMin: number;
  usedTodayMin: number;
}

/** Entries the user has acted on keep their place when the plan is rebuilt, and their time stays spent. */
const spendsTime = (entry: DailyTask) => entry.outcome === "COMPLETED" || entry.outcome === "PARTIAL";

async function load(user: User, today: IsoDate, existing: DailyPlan | null): Promise<Loaded> {
  const db = getDb();
  const [goals, tasks, dependencies] = await Promise.all([
    database.listGoals(db, user.id),
    database.listTasksForPlanning(db, user.id),
    database.listDependencies(db, user.id),
  ]);

  const handled = (existing?.tasks ?? []).filter((entry) => entry.outcome !== "PENDING");
  const usedTodayMin = handled.filter(spendsTime).reduce((sum, entry) => sum + entry.plannedMin, 0);
  const capacity = { userDailyCapacityMin: user.defaultDailyCapacityMin, activeGoalCapacitiesMin: goals.filter((g) => g.status === "ACTIVE").map((g) => g.dailyCapacityMin) };

  return {
    goals,
    tasks,
    dayCapacityMin: capacityForDate(capacity),
    usedTodayMin,
    input: {
      today,
      dayCapacityMin: capacityForDate({ ...capacity, usedTodayMin }),
      goals,
      tasks,
      dependencies,
      multipliers: [], // filled from the execution model in Phase 9
      handledTodayTaskIds: handled.map((entry) => entry.taskId),
    },
  };
}

function present(plan: DailyPlan, loaded: Loaded, excluded: ExcludedTask[]): TodayPlan {
  const tasks = new Map(loaded.tasks.map((task) => [task.id, task]));
  const goals = new Map(loaded.goals.map((goal) => [goal.id, { id: goal.id, title: goal.title }]));
  const withGoal = (taskId: string) => {
    const task = tasks.get(taskId);
    const goal = task && goals.get(task.goalId);
    return task && goal ? { task, goal } : null;
  };

  const entries = plan.tasks.flatMap((entry) => {
    const found = withGoal(entry.taskId);
    return found ? [{ ...entry, ...found }] : [];
  });
  const activeGoals = loaded.goals.filter((goal) => goal.status === "ACTIVE");
  const openTasks = loaded.tasks.filter((task) => task.status !== "DONE" && task.status !== "DROPPED" && activeGoals.some((g) => g.id === task.goalId));

  let emptyReason: TodayPlan["emptyReason"] = null;
  if (entries.length === 0) {
    emptyReason = activeGoals.length === 0 ? "NO_GOALS" : openTasks.length === 0 ? "ALL_DONE" : loaded.dayCapacityMin === 0 ? "NO_CAPACITY" : "NOTHING_ELIGIBLE";
  }

  return {
    date: plan.date,
    capacityMin: plan.capacityMin,
    usedMin: plan.usedMin,
    plannerVersion: plan.plannerVersion,
    generatedAt: plan.generatedAt,
    entries,
    needsSplit: excluded.filter((e) => e.needsSplit).flatMap((e) => withGoal(e.taskId) ?? []),
    emptyReason,
  };
}

function logRun(user: User, output: PlannerOutput) {
  console.log(
    JSON.stringify({
      level: "info",
      event: "planner_run",
      userId: user.id,
      date: output.date,
      plannerVersion: output.plannerVersion,
      capacityMin: output.dayCapacityMin,
      usedMin: output.usedMin,
      planned: output.tasks.map((t) => ({ taskId: t.taskId, score: t.score, reason: t.reason })),
      excluded: output.excluded.reduce<Record<string, number>>((counts, e) => ({ ...counts, [e.why]: (counts[e.why] ?? 0) + 1 }), {}),
    }),
  );
}

/** Runs the planner and stores the result as today's plan, keeping entries the user already acted on. */
async function build(user: User, today: IsoDate, existing: DailyPlan | null): Promise<TodayPlan> {
  const loaded = await load(user, today, existing);
  const output = generateDailyPlan(loaded.input);
  logRun(user, output);

  const plan = await database.saveDailyPlan(getDb(), user.id, {
    date: today,
    capacityMin: loaded.dayCapacityMin,
    // Time already spent today plus what is newly planned; never more than the day holds.
    usedMin: Math.min(loaded.dayCapacityMin, loaded.usedTodayMin + output.usedMin),
    plannerVersion: output.plannerVersion,
    tasks: output.tasks.map(({ taskId, order, plannedMin, score, reason }) => ({ taskId, order, plannedMin, score, reason })),
  });
  return present(plan, loaded, output.excluded);
}

/** Today's plan, created on first request. Reading it again does not reshuffle the day. */
export async function getTodayPlan(user: User): Promise<TodayPlan> {
  const today = todayIn(user.timezone);
  const existing = await database.getDailyPlan(getDb(), user.id, today);
  if (!existing) return build(user, today, null);

  // The stored plan is shown as it is; the planner is run without saving, only to report what needs splitting.
  const loaded = await load(user, today, existing);
  return present(existing, loaded, generateDailyPlan(loaded.input).excluded);
}

/** Rebuilds today's plan from the current state of the goals. */
export async function regenerateTodayPlan(user: User): Promise<TodayPlan> {
  const today = todayIn(user.timezone);
  return build(user, today, await database.getDailyPlan(getDb(), user.id, today));
}

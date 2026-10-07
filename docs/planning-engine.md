# NOVA — Planning Engine

Status: **approved 2026-10-06, implemented 2026-10-07** in `packages/planner`. Every worked example in §7 is a unit test with the same number in `tests/planner/scheduler.test.ts`. Section 10 lists what changed between this design and the code.

## 1. What the planner is

One pure function:

```ts
function generateDailyPlan(input: PlannerInput): PlannerOutput;
```

It answers "what should this user do today?" from plain data. It never calls the LLM, never reads the database, never reads the clock and never uses randomness. The same input always gives the same output, in any order the input arrays arrive.

The LLM's only influence on a plan is indirect: it proposed the tasks, and a person confirmed them.

## 2. Input and output

All dates are ISO calendar dates (`"2026-10-06"`) in the user's timezone. All durations are whole minutes.

```ts
type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "DEFERRED" | "DROPPED";
type HealthStatus = "ON_TRACK" | "AT_RISK" | "OFF_TRACK";

interface PlannerGoal {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  priority: Priority;
  deadline: string;
  dailyCapacityMin: number;        // time the user intends to give this goal per day
  health?: HealthStatus;           // absent until Phase 10
}

interface PlannerTask {
  id: string;
  goalId: string;
  status: TaskStatus;
  priority: Priority;
  estimatedMin: number;
  category: string;                // e.g. "writing", "maths", "reading"
  deadline?: string;               // the task's own deadline, if it has one
  milestoneTargetDate?: string;
  deferredUntil?: string;          // only meaningful when status is DEFERRED
  createdAt: string;               // ISO timestamp, used only for tie-breaking
}

interface PlannerInput {
  today: string;
  dayCapacityMin: number;          // from capacity.ts, already net of time used today
  goals: PlannerGoal[];
  tasks: PlannerTask[];
  dependencies: { taskId: string; dependsOnTaskId: string }[];
  multipliers?: { category: string; multiplier: number }[];   // empty until Phase 9
  maxTasks?: number;               // default 5
}

type ExclusionReason =
  | "BLOCKED" | "NO_CAPACITY" | "LONGER_THAN_CAPACITY" | "MAX_TASKS" | "DEFERRED" | "GOAL_INACTIVE";

interface ScoreTerms {             // each in [0, 1], before weighting
  pressure: number; priority: number; overdue: number;
  unblocks: number; risk: number; continuity: number;
}

interface PlannedTask {
  taskId: string; order: number; plannedMin: number;
  score: number; terms: ScoreTerms; reason: string;
}

interface PlannerOutput {
  date: string;
  dayCapacityMin: number;
  usedMin: number;
  tasks: PlannedTask[];
  excluded: { taskId: string; why: ExclusionReason; needsSplit: boolean }[];
  plannerVersion: string;          // "v1"
}
```

Invalid input (a dependency cycle, a dependency on an unknown task, a negative duration) throws a typed `PlannerInputError`. The planner never guesses its way past bad data.

## 3. Capacity (`capacity.ts`)

```
dayCapacityMin = max(0, min(user.defaultDailyCapacityMin, Σ dailyCapacityMin of ACTIVE goals) − minutesAlreadyCompletedToday)
```

- The user's figure is the day's total budget. A goal's figure is what the user intends for that goal.
- One goal at 120 with a user budget of 120 gives 120. Two goals at 60 and 90 with a user budget of 120 give 120. One goal at 45 with a user budget of 120 gives 45: NOVA does not plan more for a goal than the user offered.
- Capacity is produced by a `CapacitySource`. v1 has one source (the stated numbers). A calendar source (Phase 15) subtracts busy time without changing the planner.

## 4. The algorithm

### Step 1 — Classify every unfinished task

A task is **finished** if its status is `DONE` or `DROPPED`. For every other task, in this order:

1. Goal not `ACTIVE` → excluded `GOAL_INACTIVE`.
2. Status `DEFERRED` and `deferredUntil` is after `today` → excluded `DEFERRED`. (On or before today, it is treated as `TODO`.)
3. Any dependency not finished → excluded `BLOCKED`.
4. Otherwise the task is **eligible**.

A `DROPPED` dependency counts as finished: dropping a prerequisite must not block what follows forever.

### Step 2 — Adjusted duration

```
adjustedMin = ceil(estimatedMin × multiplier(category))
```

`multiplier` is 1.0 when the category has no entry. In Phases 5–8 the list is empty, so `adjustedMin = estimatedMin`.

### Step 3 — Score

Six terms, each normalised to the range 0–1, combined with fixed weights. All constants live in `weights.ts`.

| Term | Weight | Definition |
|---|---|---|
| `pressure` | 35 | `max(goalPressure, taskUrgency)` — see below |
| `priority` | 25 | `(value(task.priority) + value(goal.priority)) / 2` with LOW 0.25, MEDIUM 0.5, HIGH 0.75, CRITICAL 1.0 |
| `overdue` | 15 | 1 if the task has its own deadline and it is before `today`, else 0 |
| `unblocks` | 10 | `min(downstream, 5) / 5` where `downstream` is the number of unfinished tasks that depend on this one, directly or through a chain |
| `risk` | 10 | 0 for ON_TRACK or unknown, 0.5 for AT_RISK, 1 for OFF_TRACK (always 0 before Phase 10) |
| `continuity` | 5 | 1 if the task is `IN_PROGRESS`, else 0 |

```
score = 35·pressure + 25·priority + 15·overdue + 10·unblocks + 10·risk + 5·continuity      (range 0–100)
```

**Goal pressure** — how much of the remaining time this goal needs:

```
remainingMin  = Σ adjustedMin of the goal's unfinished tasks
daysLeft      = max(1, number of days from today to goal.deadline, counting both)
goalPressure  = clamp(remainingMin / (daysLeft × goal.dailyCapacityMin), 0, 1)
```

A goal needing 540 minutes with 10 days left at 60 minutes a day has pressure 540 / 600 = 0.9.

**Task urgency** — only for tasks with their own deadline:

```
d            = days from today to task.deadline (negative if it has passed)
taskUrgency  = clamp(1 − d / 14, 0, 1)
```

Due in 14 days or more gives 0; due in 7 days gives 0.5; due today or overdue gives 1.

The score is rounded to 3 decimal places before any comparison, so floating-point noise can never change the order.

### Step 4 — Order

Sort eligible tasks by:

1. score, highest first;
2. effective deadline, earliest first (the task's own deadline, else its milestone target date, else the goal deadline);
3. `createdAt`, earliest first;
4. `id`, alphabetical.

Rule 4 guarantees a total order: no two tasks are ever "equal".

### Step 5 — Fill the day

```
remaining = dayCapacityMin
for each task in order:
    if plan already has maxTasks tasks        → exclude MAX_TASKS
    else if adjustedMin > dayCapacityMin      → exclude LONGER_THAN_CAPACITY, needsSplit = (dayCapacityMin > 0)
    else if adjustedMin > remaining           → exclude NO_CAPACITY
    else                                      → add to plan; remaining −= adjustedMin
```

- A task that does not fit is skipped and the walk continues, so a smaller task further down can still use the time.
- A task longer than the whole day can never be scheduled as it stands. `needsSplit` tells the replanner (Phase 9) to break it up; before Phase 9 the Today page shows it as "too big for one day — split it".
- v1 does not schedule part of a task. Splitting is an explicit, visible change to the task graph, not something hidden in the schedule.
- v1 produces an ordered list with minutes, not clock times. Time-of-day placement arrives with the execution model (Phase 9) and calendar (Phase 15).

### Step 6 — Explain

Each planned task gets a `reason` built from its two largest weighted terms (ignoring zero terms), using fixed phrases:

| Term | Phrase |
|---|---|
| pressure (from goal) | "{goal} needs about {n} min/day to stay on schedule" |
| pressure (from task deadline) | "due in {d} days" / "due today" |
| priority | "high priority" / "critical priority" |
| overdue | "its deadline has passed" |
| unblocks | "unblocks {n} other tasks" |
| risk | "{goal} is at risk" |
| continuity | "you already started it" |

When a multiplier changed the duration, the reason appends: "Planned {adjusted} min: your {category} tasks usually take {multiplier}× the estimate."

Example: `"Portfolio needs about 54 min/day to stay on schedule, and this unblocks 3 other tasks."`

## 5. Properties the tests must prove

1. **Deterministic** — shuffling `tasks`, `goals` or `dependencies` never changes the output.
2. **Never over capacity** — `usedMin ≤ dayCapacityMin`.
3. **Never blocked** — no planned task has an unfinished dependency.
4. **Bounded** — at most `maxTasks` tasks.
5. **Accounted for** — every unfinished task appears exactly once, in `tasks` or in `excluded`.
6. **Explained** — every planned task has a non-empty `reason`.
7. **Pure** — the input object is not mutated.

## 6. Dependency resolver (`dependency-resolver.ts`)

| Function | Behaviour |
|---|---|
| `buildGraph(tasks, deps)` | Adjacency lists in both directions; throws on a dependency that names an unknown task or on a self-dependency |
| `detectCycle(graph)` | Returns the ids forming a cycle, or `null` |
| `topologicalOrder(graph)` | Stable order (ties by id); throws if there is a cycle |
| `getUnblockedTasks(graph)` | Unfinished tasks whose dependencies are all finished |
| `countDownstream(graph, taskId)` | Number of distinct unfinished tasks reachable through dependents |

Cycles are also rejected when a dependency is saved (Phase 3), so the planner should never see one; it still checks.

## 7. Worked examples

Unless stated: one ACTIVE goal with MEDIUM priority (0.5), goal pressure 0.5, no task deadlines, no dependencies, all tasks `TODO`, no multipliers, `maxTasks` 5. With pressure 0.5 the pressure term contributes 35 × 0.5 = 17.5 to every task.

### Example 1 — Reference case from the spec

Capacity 120.

| Task | Min | Task priority | priority term | Score |
|---|---|---|---|---|
| A | 60 | HIGH | (0.75 + 0.5) / 2 = 0.625 | 17.5 + 15.625 = **33.125** |
| B | 40 | MEDIUM | 0.5 | 17.5 + 12.5 = **30.000** |
| C | 30 | LOW | 0.375 | 17.5 + 9.375 = **26.875** |

Fill: A (60 left) → B (20 left) → C needs 30, does not fit.

**Plan: A, B. Used 100. Excluded: C — NO_CAPACITY.**

### Example 2 — Skip what does not fit, keep going

Capacity 60. Same priorities and scores as Example 1.

| Task | Min | Score |
|---|---|---|
| X | 50 | 33.125 |
| Y | 30 | 30.000 |
| Z | 10 | 26.875 |

Fill: X (10 left) → Y does not fit → Z fits (0 left).

**Plan: X, Z. Used 60. Excluded: Y — NO_CAPACITY.**

### Example 3 — A blocked task is never scheduled

Capacity 120. T1 depends on T0.

| Task | Min | Priority | Note | Score |
|---|---|---|---|---|
| T1 | 60 | CRITICAL | depends on T0 (TODO) | not eligible |
| T2 | 30 | MEDIUM | | 17.5 + 12.5 = **30.000** |
| T0 | 45 | LOW | 1 task downstream → unblocks = 0.2 | 17.5 + 9.375 + 2 = **28.875** |

**Plan: T2, T0. Used 75. Excluded: T1 — BLOCKED.** T1 becomes eligible the day after T0 is done.

### Example 4 — Tie-breaking

Capacity 30. Three 30-minute MEDIUM tasks, all scoring 30.000, same goal.

| Task id | Own deadline | createdAt |
|---|---|---|
| `t-b` | none | Oct 1 |
| `t-a` | none | Oct 1 |
| `t-c` | none | Sep 30 |

No task has its own deadline, so every effective deadline is the goal's and rule 2 ties. Rule 3: `t-c` was created first.

**Plan: t-c.** Remove `t-c` and rule 3 ties between `t-a` and `t-b`; rule 4 picks `t-a`.

A task deadline does more than break ties: it also raises `pressure` through task urgency, so it usually wins on score before rule 2 is reached.

### Example 5 — Two goals competing for one day

Capacity 60. Today is Oct 6. Each goal has one eligible task today; the rest of its remaining work is in tasks deferred to later dates (they count towards remaining minutes, not towards `unblocks`).

| Goal | Priority | Remaining | Deadline | Per day | Pressure |
|---|---|---|---|---|---|
| G1 | MEDIUM | 540 min | Oct 15 (10 days) | 60 | 540 / 600 = 0.9 |
| G2 | HIGH | 360 min | Oct 25 (20 days) | 60 | 360 / 1200 = 0.3 |

| Task | Goal | Min | Task priority | Score |
|---|---|---|---|---|
| a | G1 | 60 | MEDIUM | 35 × 0.9 + 25 × 0.5 = 31.5 + 12.5 = **44.000** |
| b | G2 | 60 | HIGH | 35 × 0.3 + 25 × 0.75 = 10.5 + 18.75 = **29.250** |

**Plan: a. Excluded: b — NO_CAPACITY.** The goal that is running out of time wins over the goal that is merely more important.

### Example 6 — Overdue beats important

Capacity 30. Goal pressure 0.4. Today is Oct 6.

| Task | Min | Priority | Own deadline | pressure | Score |
|---|---|---|---|---|---|
| P | 30 | LOW | Oct 5 (passed) | max(0.4, 1) = 1 | 35 + 25 × 0.375 + 15 = **59.375** |
| Q | 30 | CRITICAL | none | 0.4 | 14 + 25 × 0.75 = **32.750** |

**Plan: P. Excluded: Q — NO_CAPACITY.**

### Example 7 — Task cap

Capacity 300. Eight 20-minute tasks with distinct scores.

**Plan: the five highest-scoring tasks. Used 100. Excluded: the other three — MAX_TASKS**, even though 200 minutes remain. A short list is a product rule, not a capacity limit.

### Example 8 — Task longer than the day

Capacity 45.

| Task | Min | Priority | Score |
|---|---|---|---|
| L | 90 | HIGH | 33.125 |
| S | 30 | MEDIUM | 30.000 |

**Plan: S. Used 30. Excluded: L — LONGER_THAN_CAPACITY, needsSplit = true.**

### Example 9 — Personal multipliers change the plan (Phase 9)

Capacity 60. Multipliers: maths 1.35, reading 1.10.

| Task | Category | Estimate | Priority | Adjusted |
|---|---|---|---|---|
| M | maths | 35 | HIGH | ceil(35 × 1.35) = ceil(47.25) = 48 |
| R | reading | 20 | MEDIUM | ceil(20 × 1.10) = 22 |

Without multipliers: 35 + 20 = 55 → **Plan: M, R.**

With multipliers: M takes 48 (12 left); R needs 22 → **Plan: M. Excluded: R — NO_CAPACITY.** The reason for M ends: "Planned 48 min: your maths tasks usually take 1.35× the estimate."

### Example 10 — Continuity

Capacity 30. Two 30-minute MEDIUM tasks; one is `IN_PROGRESS`.

| Task | Status | Score |
|---|---|---|
| J | IN_PROGRESS | 17.5 + 12.5 + 5 = **35.000** |
| K | TODO | **30.000** |

**Plan: J.**

### Example 11 — Nothing to plan

- Capacity 0, three eligible tasks → **empty plan**; all three excluded `LONGER_THAN_CAPACITY` (anything is longer than a zero-minute day; `needsSplit` is false when capacity is 0).
- Capacity 120, every task blocked or deferred → **empty plan**; each excluded with its own reason.
- No tasks at all → **empty plan**, empty `excluded`.

### Example 12 — Deferred tasks

Today is Oct 6. Capacity 60.

| Task | Status | deferredUntil | Result |
|---|---|---|---|
| D1 | DEFERRED | Oct 9 | excluded — DEFERRED |
| D2 | DEFERRED | Oct 6 | eligible, scored as TODO |

### Example 13 — Determinism

Take Example 5's input, shuffle the `tasks`, `goals` and `dependencies` arrays 50 different ways. **All 50 outputs are deeply equal.**

## 8. What later phases add (interfaces fixed now, logic later)

| Phase | Addition | Effect on the planner |
|---|---|---|
| 9 | `replanner.ts` — turns missed tasks and friction reasons into graph changes (shrink, split, rewrite, retime, defer, suggest drop) | Runs **before** the planner; the planner then sees the changed graph |
| 9 | Execution model — category multipliers, preferred maximum task size, low-completion hours | Fills `multipliers`; tasks over the preferred size are sent to the replanner for splitting |
| 10 | `goal-risk.ts` — projection and health status | Fills `goal.health`, switching on the `risk` term |
| 14 | Completion predictor | One more named term with its own weight, only if it beats the baseline in a backtest |
| 15 | Calendar capacity source | Changes `dayCapacityMin` only |

None of these changes the signature of `generateDailyPlan`.

## 9. Known limits of v1

- **Greedy, not optimal.** It can leave minutes unused that a different combination would fill. Chosen because every decision can be explained in one sentence; an optimal packer cannot say why it left out a higher-priority task.
- **No time-of-day placement.** Order and minutes only.
- **Weights are judgement, not learned.** They are constants in one file, and the worked examples pin their behaviour. Phase 14 is where data can argue with them.
- **Pressure assumes steady daily work.** A goal with no work done for a week shows rising pressure, which is intended, but it does not yet know about planned days off.

## 10. Changes made during implementation

The algorithm is as designed. These details were settled or added while building it:

- **`PlannerGoal.title`** was added, because reasons name the goal.
- **`handledTodayTaskIds`** was added to the input, with the exclusion reason `HANDLED_TODAY`. A task the user completed in part, skipped or postponed today is not planned again today when the plan is rebuilt. It sits between `BLOCKED` and eligibility in step 1.
- **Reasons** say only what explains something. Medium and low priority produce no phrase (a high-priority goal does: "… is a high-priority goal"). When a task's pressure comes from its own deadline and that deadline has passed, only "its deadline has passed" is said. The two phrases are ordered by how many points each contributed. If nothing stands out, the reason is `Next in line for "<goal>".`
- **Reason wording** is "it is due in 3 days", "it is due tomorrow", "it unblocks 2 other tasks", `"<goal>" needs about 30 min a day to stay on schedule`.
- **Goal pressure** is 1 when the goal has work left and no time left (deadline passed, or zero minutes a day), and 0 when no work is left.
- **Input errors** carry a code: `CYCLE`, `UNKNOWN_TASK`, `UNKNOWN_GOAL`, `SELF_DEPENDENCY`, `INVALID_NUMBER`, `DUPLICATE_ID`.
- **Capacity** takes an optional `busyMin`, always 0 for now, which is where calendar time will come in.

### How the plan is stored (the planning service)

- The first request of the day runs the planner and saves the result. Reading the plan again returns the saved plan unchanged; a day is not reshuffled behind the user's back.
- Rebuilding is explicit (`POST /api/plan/today/regenerate`). Entries the user already acted on stay first; time spent on completed or partly completed entries is subtracted from the day before the planner runs; skipped and postponed entries spend no time.
- An empty plan carries a reason: `NO_GOALS`, `ALL_DONE`, `NO_CAPACITY` or `NOTHING_ELIGIBLE`.
- Tasks excluded with `needsSplit` are returned alongside the plan so the screen can say "too big for one day".
- Each planner run writes one log line with the planned tasks, their scores and reasons, and a count of exclusions by cause.

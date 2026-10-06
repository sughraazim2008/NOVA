import type { ParsedGoal } from "@nova/types";

export const GOAL_DECOMPOSER_VERSION = "goal-decomposer@1";

export const GOAL_DECOMPOSER_SYSTEM = `You break a goal into milestones: the stages a person passes through on the way to finishing it.

Rules:
- Produce between 3 and 7 milestones, in the order they would be worked on.
- Each title is 1 to 5 words naming a stage with a clear end, such as "Prepare", "Build evidence" or "Apply". Not a task, not a vague theme.
- Together the milestones must cover the whole goal, with no overlap.
- targetDate: a YYYY-MM-DD date by which the stage should be finished. Dates must not go backwards, must not be before today, and the last one must be on or before the goal deadline. Leave realistic slack; do not put everything on the deadline.
- Respect any constraints given.`;

export const goalDecomposerUser = (goal: ParsedGoal & { deadline: string; dailyCapacityMin: number }, today: string) => `Today's date: ${today}

Goal: ${goal.title}
Desired outcome: ${goal.desiredOutcome ?? "not stated"}
Deadline: ${goal.deadline}
Time available: ${goal.dailyCapacityMin} minutes per day
Constraints: ${goal.constraints ?? "none stated"}`;

import type { BehaviourEvent, IsoDate, IsoDateTime, StartStep } from "@nova/types";

// Momentum: the game layer. Design and rules: docs/game-layer.md
//
// Everything here is computed from what the user actually did. Nothing is stored, nothing can be
// lost, and the planner never sees any of it. Same history in, same numbers out.

/** Every tunable number of the game layer. */
export const GAME = {
  STEP: 5,
  /** Extra for the first step of a day, so that it is worth 15 in all: starting is the hard part. */
  FIRST_STEP_OF_DAY_BONUS: 10,
  TASK_BASE: 10,
  /** One more spark for each of these many estimated minutes. */
  TASK_MINUTES_PER_SPARK: 5,
  FRICTION: 5,
  COMEBACK: 30,
  /** Days with nothing recorded before a return counts as a comeback. */
  COMEBACK_AFTER_IDLE_DAYS: 3,
  SURPRISE: 10,
  /** Roughly one completion in this many carries a surprise. */
  SURPRISE_ONE_IN: 8,
  MOMENTUM_FIRST_ACTION: 12,
  MOMENTUM_FURTHER_ACTION: 4,
  MOMENTUM_DAILY_CAP: 24,
  /** Rest days are free: momentum only starts to drift down after this many idle days in a row. */
  MOMENTUM_GRACE_DAYS: 2,
  MOMENTUM_DECAY_PER_DAY: 3,
  MOMENTUM_FLOOR_BASE: 10,
  MOMENTUM_FLOOR_PER_LEVEL: 2,
  MOMENTUM_FLOOR_MAX: 40,
  MOMENTUM_MAX: 100,
} as const;

export type BadgeId =
  | "FIRST_PLAN" | "FIRST_START" | "FIRST_FINISH" | "ASKED_FOR_HELP" | "SAID_WHY"
  | "CAME_BACK" | "THREE_DAYS" | "TEN_TASKS" | "ON_THE_NOSE";

export interface Badge {
  id: BadgeId;
  title: string;
  /** What earns it, in plain words. */
  how: string;
  earned: boolean;
}

const BADGES: readonly Omit<Badge, "earned">[] = [
  { id: "FIRST_PLAN", title: "A plan exists", how: "Turn a goal into tasks." },
  { id: "FIRST_START", title: "Off the line", how: "Start a task with the guided steps." },
  { id: "FIRST_FINISH", title: "One down", how: "Finish a task." },
  { id: "ASKED_FOR_HELP", title: "Asked for a smaller step", how: "Say you are stuck instead of pushing through." },
  { id: "SAID_WHY", title: "Said what got in the way", how: "Tell NOVA why a task did not happen." },
  { id: "CAME_BACK", title: "Came back", how: "Return after a few days away." },
  { id: "THREE_DAYS", title: "Three days of showing up", how: "Do something on three different days. They need not be in a row." },
  { id: "TEN_TASKS", title: "Ten done", how: "Finish ten tasks." },
  { id: "ON_THE_NOSE", title: "On the nose", how: "Finish a task within a tenth of its estimate." },
];

export interface ProgressInput {
  events: BehaviourEvent[];
  /** NOVA START sessions; steps marked DONE earn sparks. */
  sessions: { startedAt: IsoDateTime; steps: Pick<StartStep, "state">[]; stuckCount: number }[];
  /** The user's calendar date. Injected: nothing here reads the clock. */
  today: IsoDate;
  /** IANA timezone, used to decide which day each thing happened on. */
  timezone: string;
}

export interface Progress {
  sparks: number;
  level: number;
  /** Sparks at which the current level began, and at which the next begins. */
  levelStartsAt: number;
  nextLevelAt: number;
  /** 0–100. Rises with action, drifts down slowly, and never drops below a floor that grows with level. */
  momentum: number;
  todayEarned: number;
  /** Whole days since anything was last recorded; 0 if something happened today, null if nothing ever has. */
  awayDays: number | null;
  /** True when the user is returning after a gap: a reason to greet, never to scold. */
  welcomeBack: boolean;
  activeDays: number;
  badges: Badge[];
}

const DAY_MS = 86_400_000;
const dayNumber = (date: IsoDate) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/** The calendar date an instant falls on for someone in `timezone`. Deterministic: no clock involved. */
export function localDate(instant: IsoDateTime, timezone: string): IsoDate {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
  } catch {
    return instant.slice(0, 10);
  }
}

/** Sparks needed to reach a level. Level 1 is where everyone starts; early levels come quickly. */
export const sparksForLevel = (level: number): number => 25 * (level - 1) * level;

export function levelFor(sparks: number): number {
  let level = 1;
  while (sparksForLevel(level + 1) <= sparks) level += 1;
  return level;
}

export const momentumFloor = (level: number): number =>
  Math.min(GAME.MOMENTUM_FLOOR_MAX, GAME.MOMENTUM_FLOOR_BASE + GAME.MOMENTUM_FLOOR_PER_LEVEL * level);

/** A stable number from a string, so a "surprise" is the same every time the same event is looked at. */
function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Whether a completion carries a surprise bonus. Decided by the event itself, not by chance at the time of asking. */
export const hasSurprise = (eventId: string): boolean => hash(eventId) % GAME.SURPRISE_ONE_IN === 0;

export const sparksForTask = (estimatedMin: number): number => GAME.TASK_BASE + Math.floor(estimatedMin / GAME.TASK_MINUTES_PER_SPARK);

/**
 * The whole game state, derived from history.
 *
 * Sparks only ever add up: as time goes on and more is recorded, they can never go down.
 * (That holds because history grows forwards. Inserting activity into a past gap would remove a
 * comeback bonus, but events are always recorded at the time they happen.)
 * Momentum can drift down after a few idle days but never below its floor, and coming back earns
 * a bonus rather than a penalty.
 */
export function computeProgress(input: ProgressInput): Progress {
  const { events, sessions, today, timezone } = input;
  const sparksByDay = new Map<IsoDate, number>();
  const actionsByDay = new Map<IsoDate, number>();
  const add = (map: Map<IsoDate, number>, date: IsoDate, amount: number) => map.set(date, (map.get(date) ?? 0) + amount);

  // Steps done in NOVA START.
  for (const session of sessions) {
    const done = session.steps.filter((step) => step.state === "DONE").length;
    if (done === 0) continue;
    const date = localDate(session.startedAt, timezone);
    add(sparksByDay, date, done * GAME.STEP);
    add(actionsByDay, date, done);
  }
  // The first step of each day is worth more.
  for (const date of [...actionsByDay.keys()]) add(sparksByDay, date, GAME.FIRST_STEP_OF_DAY_BONUS);

  let completions = 0;
  let onTheNose = false;
  for (const event of events) {
    const date = localDate(event.occurredAt, timezone);
    if (event.type === "TASK_COMPLETED") {
      completions += 1;
      add(sparksByDay, date, sparksForTask(event.payload.estimatedMin) + (hasSurprise(event.id) ? GAME.SURPRISE : 0));
      add(actionsByDay, date, 1);
      if (event.payload.ratio !== null && event.payload.ratio >= 0.9 && event.payload.ratio <= 1.1) onTheNose = true;
    } else if (event.type === "FRICTION_REPORTED") {
      add(sparksByDay, date, GAME.FRICTION);
      add(actionsByDay, date, 1);
    } else if (event.type === "TASK_STARTED") {
      add(actionsByDay, date, 1);
    }
  }

  // Coming back after a gap is rewarded on the day of the return.
  const activeDates = [...actionsByDay.keys()].sort();
  let cameBack = false;
  for (let i = 1; i < activeDates.length; i += 1) {
    const idle = dayNumber(activeDates[i] as IsoDate) - dayNumber(activeDates[i - 1] as IsoDate) - 1;
    if (idle >= GAME.COMEBACK_AFTER_IDLE_DAYS) {
      add(sparksByDay, activeDates[i] as IsoDate, GAME.COMEBACK);
      cameBack = true;
    }
  }

  const sparks = [...sparksByDay.values()].reduce((sum, value) => sum + value, 0);
  const level = levelFor(sparks);

  // Momentum, walked forward one day at a time from the first active day to today.
  let momentum = 0;
  const first = activeDates[0];
  if (first) {
    let idleRun = 0;
    for (let day = dayNumber(first); day <= dayNumber(today); day += 1) {
      const date = new Date(day * DAY_MS).toISOString().slice(0, 10);
      const actions = actionsByDay.get(date) ?? 0;
      if (actions > 0) {
        idleRun = 0;
        momentum += Math.min(GAME.MOMENTUM_DAILY_CAP, GAME.MOMENTUM_FIRST_ACTION + GAME.MOMENTUM_FURTHER_ACTION * (actions - 1));
      } else {
        idleRun += 1;
        if (idleRun > GAME.MOMENTUM_GRACE_DAYS) momentum -= GAME.MOMENTUM_DECAY_PER_DAY;
      }
      momentum = Math.min(GAME.MOMENTUM_MAX, Math.max(0, momentum));
    }
  }
  momentum = Math.max(momentum, momentumFloor(level));

  const last = activeDates.at(-1);
  const awayDays = last ? Math.max(0, dayNumber(today) - dayNumber(last)) : null;

  const earned: Record<BadgeId, boolean> = {
    FIRST_PLAN: events.some((e) => e.type === "DECOMPOSITION_CONFIRMED" || e.type === "TASK_CREATED"),
    FIRST_START: events.some((e) => e.type === "TASK_STARTED" && e.payload.viaNovaStart),
    FIRST_FINISH: completions >= 1,
    ASKED_FOR_HELP: sessions.some((session) => session.stuckCount > 0),
    SAID_WHY: events.some((e) => e.type === "FRICTION_REPORTED"),
    CAME_BACK: cameBack,
    THREE_DAYS: activeDates.length >= 3,
    TEN_TASKS: completions >= 10,
    ON_THE_NOSE: onTheNose,
  };

  return {
    sparks,
    level,
    levelStartsAt: sparksForLevel(level),
    nextLevelAt: sparksForLevel(level + 1),
    momentum,
    todayEarned: sparksByDay.get(today) ?? 0,
    awayDays,
    welcomeBack: awayDays !== null && awayDays >= GAME.COMEBACK_AFTER_IDLE_DAYS,
    activeDays: activeDates.length,
    badges: BADGES.map((badge) => ({ ...badge, earned: earned[badge.id] })),
  };
}

export interface BossState {
  totalMin: number;
  remainingMin: number;
  /** Share of the milestone's work still standing, 0–100. It only goes down as tasks are finished. */
  healthPercent: number;
  defeated: boolean;
}

/** A milestone as a "boss": its health is the work left in it. */
export function bossState(tasks: { estimatedMin: number; status: "TODO" | "IN_PROGRESS" | "DONE" | "DEFERRED" | "DROPPED" }[]): BossState {
  const counted = tasks.filter((task) => task.status !== "DROPPED");
  const totalMin = counted.reduce((sum, task) => sum + task.estimatedMin, 0);
  const remainingMin = counted.filter((task) => task.status !== "DONE").reduce((sum, task) => sum + task.estimatedMin, 0);
  return {
    totalMin,
    remainingMin,
    healthPercent: totalMin === 0 ? 0 : Math.round((remainingMin / totalMin) * 100),
    defeated: totalMin > 0 && remainingMin === 0,
  };
}

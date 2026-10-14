import {
  GAME,
  bossState,
  computeProgress,
  frictionReported,
  hasSurprise,
  levelFor,
  localDate,
  momentumFloor,
  sparksForLevel,
  sparksForTask,
  taskCompleted,
  taskStarted,
  type ProgressInput,
} from "@nova/behaviour";
import { generateDailyPlan } from "@nova/planner";
import { BehaviourEventSchema, type BehaviourEvent, type NewBehaviourEvent, type Task } from "@nova/types";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { input as plannerInput, seeded, task as plannerTask } from "../planner/builders";

const TZ = "UTC";
const day = (n: number, hour = 18) => new Date(Date.UTC(2026, 9, n, hour)).toISOString(); // October 2026
const date = (n: number) => day(n).slice(0, 10);

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1", milestoneId: "m1", goalId: "g1", parentTaskId: null, title: "Task", description: null, estimatedMin: 30, actualMin: null,
  priority: "MEDIUM", category: "WRITING", energyDemand: "MEDIUM", deadline: null, status: "TODO", deferredUntil: null, origin: "AI",
  startCount: 1, postponeCount: 0, completedAt: null, createdAt: day(1), ...overrides,
});

// Ids are chosen so that none of these events carries a surprise bonus unless a test asks for one.
const plain = (() => {
  const ids: string[] = [];
  for (let i = 0; ids.length < 400; i += 1) if (!hasSurprise(`e${i}`)) ids.push(`e${i}`);
  return ids;
})();
let next = 0;
const stored = (event: NewBehaviourEvent, id = plain[(next += 1)]!): BehaviourEvent =>
  BehaviourEventSchema.parse({ ...event, id, userId: "u1", taskId: event.taskId ?? null, goalId: event.goalId ?? null });
const moment = (n: number, hour = 18) => ({ now: day(n, hour), localHour: hour, dayOfWeek: 2 });

const completed = (n: number, estimatedMin = 30, actualMin: number | null = null, id?: string) =>
  stored(taskCompleted(task({ estimatedMin, actualMin }), moment(n), 1)[0]!, id);
const started = (n: number, viaNovaStart = true) => stored(taskStarted(task(), moment(n), viaNovaStart));
const friction = (n: number) => stored(frictionReported(task(), moment(n), "TOO_OVERWHELMING", false));
const session = (n: number, done: number, extra: { skipped?: number; stuck?: number } = {}) => ({
  startedAt: day(n),
  stuckCount: extra.stuck ?? 0,
  steps: [...Array(done).fill({ state: "DONE" }), ...Array(extra.skipped ?? 0).fill({ state: "SKIPPED" }), { state: "PENDING" }] as { state: "DONE" | "SKIPPED" | "PENDING" }[],
});

const progress = (partial: Partial<ProgressInput>, today = date(10)) =>
  computeProgress({ events: [], sessions: [], today, timezone: TZ, ...partial });

describe("sparks", () => {
  it("start at nothing for someone who has done nothing", () => {
    expect(progress({})).toMatchObject({ sparks: 0, level: 1, todayEarned: 0, awayDays: null, welcomeBack: false, activeDays: 0, momentum: momentumFloor(1) });
  });

  it("follow the table in the design: steps, the first step of a day, tasks, friction", () => {
    // One step: 5, plus 10 for being the day's first.
    expect(progress({ sessions: [session(10, 1)] }).sparks).toBe(15);
    // Three steps on one day: 15 + 5 + 5.
    expect(progress({ sessions: [session(10, 3)] }).sparks).toBe(25);
    // Two sessions the same day share one first-step bonus; a second day earns its own.
    expect(progress({ sessions: [session(10, 1), session(10, 1)] }).sparks).toBe(20);
    expect(progress({ sessions: [session(9, 1), session(10, 1)] }).sparks).toBe(30);
    // A 30-minute task: 10 + 30/5. A 60-minute task: 10 + 12. Seven minutes rounds down to 1.
    expect(sparksForTask(30)).toBe(16);
    expect(progress({ events: [completed(10, 30)] }).sparks).toBe(16);
    expect(progress({ events: [completed(10, 60)] }).sparks).toBe(22);
    expect(sparksForTask(7)).toBe(11);
    // Saying what got in the way is a move in the game, not an admission.
    expect(progress({ events: [friction(10)] }).sparks).toBe(GAME.FRICTION);
  });

  it("are not earned by skipped steps, or by merely starting", () => {
    expect(progress({ sessions: [session(10, 0, { skipped: 4 })] }).sparks).toBe(0);
    expect(progress({ events: [started(10)] }).sparks).toBe(0);
  });

  it("count what was earned today separately", () => {
    const result = progress({ sessions: [session(9, 2), session(10, 1)], events: [completed(10, 30)] });
    expect(result.sparks).toBe(20 + 15 + 16);
    expect(result.todayEarned).toBe(31);
  });

  it("never go down as time goes on and more is done", () => {
    // History only ever grows forwards: each new thing happens on the same day as the last or later.
    const random = seeded(99);
    const events: BehaviourEvent[] = [];
    const sessions: ProgressInput["sessions"] = [];
    let previous = 0;
    let n = 1;
    for (let i = 0; i < 200; i += 1) {
      if (n < 28 && random.next() < 0.2) n += random.int(1, 5);
      n = Math.min(n, 28);
      const kind = random.int(0, 3);
      if (kind === 0) events.push(completed(n, random.int(5, 120)));
      else if (kind === 1) events.push(friction(n));
      else if (kind === 2) events.push(started(n));
      else sessions.push(session(n, random.int(0, 5), { skipped: random.int(0, 2) }));
      const current = computeProgress({ events, sessions, today: date(n), timezone: TZ }).sparks;
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
    expect(previous).toBeGreaterThan(0);
  });

  it("are the same whatever order the history arrives in", () => {
    const events = [completed(3), friction(4), started(5), completed(9, 60), completed(9, 20)];
    const sessions = [session(3, 2), session(9, 4, { stuck: 1 }), session(5, 1)];
    const random = seeded(5);
    const expected = progress({ events, sessions });
    for (let i = 0; i < 20; i += 1) expect(progress({ events: random.shuffle(events), sessions: random.shuffle(sessions) })).toEqual(expected);
  });
});

describe("surprise bonus", () => {
  it("is decided by the event itself, so it is the same every time", () => {
    const lucky = Array.from({ length: 200 }, (_, i) => `evt-${i}`).find(hasSurprise)!;
    expect(hasSurprise(lucky)).toBe(true);
    const withBonus = progress({ events: [completed(10, 30, null, lucky)] });
    expect(withBonus.sparks).toBe(16 + GAME.SURPRISE);
    expect(progress({ events: [completed(10, 30, null, lucky)] })).toEqual(withBonus);
  });

  it("turns up for roughly one completion in eight", () => {
    const hits = Array.from({ length: 4000 }, (_, i) => `cmux${i}abc`).filter(hasSurprise).length;
    expect(hits).toBeGreaterThan(4000 / 8 - 120);
    expect(hits).toBeLessThan(4000 / 8 + 120);
  });
});

describe("levels", () => {
  it("come quickly at first and more slowly later", () => {
    expect([1, 2, 3, 4, 5, 6].map(sparksForLevel)).toEqual([0, 50, 150, 300, 500, 750]);
    expect([0, 49, 50, 149, 150, 299, 300, 10_000].map(levelFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 20]);
  });

  it("report where the current level began and where the next begins", () => {
    const sessions = Array.from({ length: 4 }, (_, i) => session(i + 1, 3)); // 4 × 25 = 100 sparks
    expect(progress({ sessions })).toMatchObject({ sparks: 100, level: 2, levelStartsAt: 50, nextLevelAt: 150 });
  });
});

describe("momentum", () => {
  const at = (sessions: ProgressInput["sessions"], today: number, events: BehaviourEvent[] = []) =>
    computeProgress({ sessions, events, today: date(today), timezone: TZ }).momentum;

  it("rises with the first action of a day and a little more with each further one, up to a daily cap", () => {
    expect(at([session(10, 1)], 10)).toBe(12);
    expect(at([session(10, 2)], 10)).toBe(16);
    expect(at([session(10, 4)], 10)).toBe(24);
    expect(at([session(10, 30)], 10)).toBe(GAME.MOMENTUM_DAILY_CAP);
  });

  it("builds over consecutive days and stops at 100", () => {
    expect(at([session(8, 4), session(9, 4), session(10, 4)], 10)).toBe(72);
    expect(at(Array.from({ length: 10 }, (_, i) => session(i + 1, 4)), 10)).toBe(100);
  });

  it("does not fall on rest days, and only drifts after the grace period", () => {
    const week = [session(1, 4), session(2, 4), session(3, 4)]; // 72 by the 3rd
    expect(at(week, 3)).toBe(72);
    expect(at(week, 4)).toBe(72);
    expect(at(week, 5)).toBe(72);
    expect(at(week, 6)).toBe(69);
    expect(at(week, 7)).toBe(66);
  });

  it("never reaches zero and never drops below a floor that rises with level", () => {
    const longAgo = [session(1, 4), session(2, 4), session(3, 4)];
    expect(at(longAgo, 28)).toBe(momentumFloor(2)); // 75 sparks → level 2 → floor 14
    expect(momentumFloor(1)).toBe(12);
    expect(momentumFloor(15)).toBe(40);
    expect(momentumFloor(99)).toBe(GAME.MOMENTUM_FLOOR_MAX);
    for (const today of [4, 10, 20, 28]) expect(at(longAgo, today)).toBeGreaterThan(0);
  });

  it("picks straight back up on the day of a return", () => {
    const before = at([session(1, 4)], 20);
    const after = at([session(1, 4), session(20, 2)], 20);
    expect(after).toBeGreaterThan(before);
  });

  it("counts starting a task and reporting friction as actions too", () => {
    expect(at([], 10, [started(10), friction(10)])).toBe(16);
  });
});

describe("coming back", () => {
  it("earns a bonus on the day of the return, at exactly three idle days and not before", () => {
    const twoIdle = progress({ sessions: [session(1, 1), session(4, 1)] }); // 2nd and 3rd idle
    const threeIdle = progress({ sessions: [session(1, 1), session(5, 1)] }); // 2nd, 3rd, 4th idle
    expect(twoIdle.sparks).toBe(30);
    expect(threeIdle.sparks).toBe(30 + GAME.COMEBACK);
    expect(threeIdle.badges.find((b) => b.id === "CAME_BACK")?.earned).toBe(true);
    expect(twoIdle.badges.find((b) => b.id === "CAME_BACK")?.earned).toBe(false);
  });

  it("is greeted, not counted against the user", () => {
    const away = progress({ sessions: [session(1, 2)] }, date(6));
    expect(away).toMatchObject({ awayDays: 5, welcomeBack: true });
    expect(progress({ sessions: [session(1, 2)] }, date(3))).toMatchObject({ awayDays: 2, welcomeBack: false });
    expect(progress({ sessions: [session(6, 1)] }, date(6))).toMatchObject({ awayDays: 0, welcomeBack: false });
    // Being away took nothing: the sparks are exactly what they were.
    expect(away.sparks).toBe(progress({ sessions: [session(1, 2)] }, date(1)).sparks);
  });
});

describe("badges", () => {
  const earned = (partial: Partial<ProgressInput>) => progress(partial).badges.filter((b) => b.earned).map((b) => b.id);

  it("start unearned, each with a title and how to get it", () => {
    const { badges } = progress({});
    expect(badges).toHaveLength(9);
    expect(badges.every((b) => !b.earned && b.title.length > 3 && b.how.length > 10)).toBe(true);
  });

  it("mark real behaviours", () => {
    expect(earned({ events: [started(10, true)] })).toEqual(["FIRST_START"]);
    expect(earned({ events: [started(10, false)] })).toEqual([]);
    expect(earned({ events: [completed(10, 30, 31)] })).toEqual(["FIRST_FINISH", "ON_THE_NOSE"]);
    expect(earned({ events: [completed(10, 30, 60)] })).toEqual(["FIRST_FINISH"]);
    expect(earned({ events: [friction(10)] })).toEqual(["SAID_WHY"]);
    expect(earned({ sessions: [session(10, 1, { stuck: 1 })] })).toEqual(["ASKED_FOR_HELP"]);
    expect(earned({ sessions: [session(2, 1), session(5, 1), session(9, 1)] })).toContain("THREE_DAYS");
    expect(earned({ events: Array.from({ length: 10 }, () => completed(10)) })).toContain("TEN_TASKS");
    expect(earned({ events: Array.from({ length: 9 }, () => completed(10)) })).not.toContain("TEN_TASKS");
  });
});

describe("which day something happened on", () => {
  it("follows the user's timezone, not UTC", () => {
    const lateEvening = "2026-10-13T23:30:00.000Z";
    expect(localDate(lateEvening, "UTC")).toBe("2026-10-13");
    expect(localDate(lateEvening, "Asia/Tokyo")).toBe("2026-10-14");
    expect(localDate(lateEvening, "America/Los_Angeles")).toBe("2026-10-13");
    expect(localDate(lateEvening, "Not/AZone")).toBe("2026-10-13");
  });

  it("gives the first-step bonus per local day", () => {
    const sessions = [{ startedAt: "2026-10-13T23:30:00.000Z", stuckCount: 0, steps: [{ state: "DONE" as const }] }, { startedAt: "2026-10-14T00:30:00.000Z", stuckCount: 0, steps: [{ state: "DONE" as const }] }];
    // Two UTC days, but one and the same morning in Tokyo.
    expect(computeProgress({ events: [], sessions, today: "2026-10-14", timezone: "UTC" }).sparks).toBe(30);
    expect(computeProgress({ events: [], sessions, today: "2026-10-14", timezone: "Asia/Tokyo" }).sparks).toBe(20);
  });
});

describe("milestone bosses", () => {
  it("lose health only as tasks are finished", () => {
    const tasks = [{ estimatedMin: 60, status: "TODO" as const }, { estimatedMin: 30, status: "IN_PROGRESS" as const }, { estimatedMin: 30, status: "DONE" as const }];
    expect(bossState(tasks)).toEqual({ totalMin: 120, remainingMin: 90, healthPercent: 75, defeated: false });
  });

  it("are defeated when everything is done, ignore dropped tasks, and cope with an empty milestone", () => {
    expect(bossState([{ estimatedMin: 60, status: "DONE" }, { estimatedMin: 600, status: "DROPPED" }])).toEqual({ totalMin: 60, remainingMin: 0, healthPercent: 0, defeated: true });
    expect(bossState([])).toEqual({ totalMin: 0, remainingMin: 0, healthPercent: 0, defeated: false });
  });
});

describe("the planner knows nothing about any of this", () => {
  it("has no reference to behaviour or the game layer anywhere in its source", () => {
    const directory = new URL("../../packages/planner/src/", import.meta.url);
    const files = readdirSync(directory).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(5);
    for (const name of files) {
      const source = readFileSync(new URL(name, directory), "utf8");
      expect(source, name).not.toMatch(/@nova\/behaviour|momentum|sparks|badge/i);
    }
  });

  it("has no way to receive game state: its input type has no field for it, and the plan is fixed by its inputs", () => {
    const input = plannerInput(120, [plannerTask("A", 60, { priority: "HIGH" }), plannerTask("B", 40), plannerTask("C", 30, { priority: "LOW" })]);
    const before = generateDailyPlan(input);
    // A lot of game activity happens...
    computeProgress({ events: Array.from({ length: 50 }, () => completed(10)), sessions: [session(10, 20)], today: date(10), timezone: TZ });
    // ...and the plan for the same input is byte-for-byte the same.
    expect(JSON.stringify(generateDailyPlan(input))).toBe(JSON.stringify(before));
  });
});

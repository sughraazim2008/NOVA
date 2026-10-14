import { decideReplan, nextShrink, splitSizes, type ReplanInput } from "@nova/planner";
import { FrictionReasonSchema } from "@nova/types";
import { describe, expect, it } from "vitest";

const today = "2026-10-14";
const decide = (reason: ReplanInput["reason"], estimatedMin = 60, extra: Partial<ReplanInput> = {}, energyDemand: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM") =>
  decideReplan({ task: { estimatedMin, energyDemand }, reason, previousSameReason: 0, today, ...extra });

describe("the shrink ladder", () => {
  it("goes 60 → 30 → 15 → 5 and then stops", () => {
    expect([90, 60, 31, 30, 16, 15, 6, 5, 1].map(nextShrink)).toEqual([30, 30, 30, 15, 15, 5, 5, null, null]);
  });
});

describe("splitting", () => {
  it("makes two to four near-equal parts of about 30 minutes that add up to the original", () => {
    for (const minutes of [20, 31, 45, 60, 61, 90, 100, 200, 480]) {
      const parts = splitSizes(minutes);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(minutes);
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(parts.length).toBeLessThanOrEqual(4);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    }
    expect(splitSizes(60)).toEqual([30, 30]);
    expect(splitSizes(100)).toEqual([25, 25, 25, 25]);
    expect(splitSizes(91)).toEqual([23, 23, 23, 22]);
  });
});

describe("each friction reason gets its own response", () => {
  it("too big → a smaller start with the rest kept as a follow-on", () => {
    expect(decide("TOO_OVERWHELMING", 60)).toEqual({ action: "SHRINK", starterMin: 30, remainderMin: 30 });
    expect(decide("TOO_OVERWHELMING", 45)).toEqual({ action: "SHRINK", starterMin: 30, remainderMin: 15 });
  });

  it("too big again on a task already shrunk → smaller still, and finally the question of whether it matters", () => {
    expect(decide("TOO_OVERWHELMING", 30, { previousSameReason: 1 })).toEqual({ action: "SHRINK", starterMin: 15, remainderMin: 15 });
    expect(decide("TOO_OVERWHELMING", 15, { previousSameReason: 2 })).toEqual({ action: "SHRINK", starterMin: 5, remainderMin: 10 });
    expect(decide("TOO_OVERWHELMING", 5, { previousSameReason: 3 })).toEqual({ action: "DROP_SUGGESTED" });
  });

  it("don't know how to start → smaller first steps the first time, a smaller task the second", () => {
    expect(decide("DONT_KNOW_HOW_TO_START")).toEqual({ action: "MICRO_ACTIONS" });
    expect(decide("DONT_KNOW_HOW_TO_START", 60, { previousSameReason: 1 })).toEqual({ action: "SHRINK", starterMin: 30, remainderMin: 30 });
  });

  it("not enough time → split into sittings, unless it is already short", () => {
    expect(decide("NOT_ENOUGH_TIME", 90)).toEqual({ action: "SPLIT", partsMin: [30, 30, 30] });
    expect(decide("NOT_ENOUGH_TIME", 15)).toEqual({ action: "MICRO_ACTIONS" });
  });

  it("low energy → move demanding work to tomorrow; shrink easy work; ask after the third time", () => {
    expect(decide("LOW_ENERGY", 60, {}, "HIGH")).toEqual({ action: "RETIME", until: "2026-10-15" });
    expect(decide("LOW_ENERGY", 60, {}, "MEDIUM")).toEqual({ action: "RETIME", until: "2026-10-15" });
    expect(decide("LOW_ENERGY", 60, {}, "LOW")).toEqual({ action: "SHRINK", starterMin: 30, remainderMin: 30 });
    expect(decide("LOW_ENERGY", 60, { previousSameReason: 2 }, "HIGH")).toEqual({ action: "DROP_SUGGESTED" });
  });

  it("don't understand → reword it; if it is still unclear, ask whether it matters", () => {
    expect(decide("DONT_UNDERSTAND")).toEqual({ action: "REWRITE" });
    expect(decide("DONT_UNDERSTAND", 60, { previousSameReason: 1 })).toEqual({ action: "DROP_SUGGESTED" });
  });

  it("distracted → a shorter sitting, or easier first steps for a task that is already short", () => {
    expect(decide("DISTRACTED", 60)).toEqual({ action: "SHRINK", starterMin: 30, remainderMin: 30 });
    expect(decide("DISTRACTED", 15)).toEqual({ action: "MICRO_ACTIONS" });
  });

  it("don't want to → ask whether it still matters, never drop it outright", () => {
    expect(decide("DONT_WANT_TO")).toEqual({ action: "DROP_SUGGESTED" });
  });

  it("has an answer for every reason there is, and a stronger one when the same reason comes back", () => {
    for (const reason of FrictionReasonSchema.options) {
      const first = decide(reason, 60, {}, "HIGH");
      const repeated = decide(reason, 60, { previousSameReason: 5 }, "HIGH");
      expect(first.action).toBeTruthy();
      expect(repeated.action).toBeTruthy();
    }
  });

  it("is deterministic", () => {
    for (const reason of FrictionReasonSchema.options) expect(decide(reason, 47)).toEqual(decide(reason, 47));
  });
});

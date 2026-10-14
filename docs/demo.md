# NOVA — the Gate B demo

The demonstration the whole project builds towards, from the specification:

> "Here is the original goal. Here is the plan NOVA generated. I intentionally failed three tasks. Here is the behavioural data NOVA collected. Now watch it construct a different plan based on what happened."

The same scenario runs as an automated test (`tests/integration/replanning.test.ts`, "Gate B"), so it is known to work; this is how to show it to a person.

## Before you start

- Use a fresh account or the live site's demo account with nothing in it you mind changing.
- Have a goal with at least three tasks of 60–90 minutes: one ordinary, one marked **High** energy, one long. Creating it from a sentence on **New goal** shows the AI part at the same time.

## The walkthrough (about five minutes)

1. **The goal.** Open the goal page. Point out the journey map, the milestones as "bosses" with health bars, and that every task came from one sentence and was reviewed before saving.
2. **The plan.** Open **Today**. Press "Why this first?" on the quest: the reason is computed, not written by the AI. The planner is pure and deterministic; the same goals always give the same day.
3. **Fail three tasks on purpose**, each with "Not today", answering the question differently:
   - the ordinary task → **It feels too big** → NOVA shrinks it to a 30-minute start and keeps the rest as a follow-on task;
   - the high-energy task → **Low energy** → NOVA moves it to tomorrow and puts lighter work first;
   - the long task → **Not enough time** → NOVA splits it into parts of about 30 minutes, one per sitting.
   Each answer shows, in one sentence, exactly what changed.
4. **The behavioural data.** Open **Dashboard**: "What NOVA has noticed" lists what happened and what got in the way. Each answer was recorded as an event, with the task as it was at that moment.
5. **The different plan.** Back on **Today**: the skipped tasks stay marked as handled; the freed time now goes to the first part of the split task, which could not be planned before because the whole thing did not fit. Open the goal page to see the shrunk task, its follow-on, and the three parts chained in order.
6. **What it learns over time** (optional, needs history): after a few tasks of one kind have been finished through **Start** and ran long, Today plans that kind of task longer and says so in its reason ("your study tasks usually take 1.25× the estimate"), and new goals are written with smaller tasks.

## Points worth making

- The AI never chose anything in the plan. It wrote tasks and reworded one when asked; deterministic rules decided every change.
- Nothing was dropped without asking. "I don't want to do it" asks whether the task still matters.
- The game layer rewarded honesty: each friction answer earned sparks.

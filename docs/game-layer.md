# NOVA — Momentum (the game layer)

Status: designed 2026-10-06 at the developer's request. Built in Phase 8b; small pieces appear earlier in the Today and NOVA START screens.

## Why it exists

NOVA is aimed at people who know what to do and still cannot start, which describes ADHD well. For that user the hardest moment is not finishing a task; it is opening the app and beginning. A plan that is correct but dull does not get opened.

The game layer has one job: **make opening NOVA and starting a task feel rewarding straight away**, without ever making the user feel worse for a bad day.

## Design rules

Ordinary gamification often backfires for exactly this audience: a broken streak or a missed daily target becomes a reason to stop opening the app. These rules come first, and a feature that breaks one is not built.

1. **Reward starting, not only finishing.** The first micro-step of the day earns the most. Starting is the behaviour NOVA exists to produce.
2. **Reward now.** Feedback lands within a second of the action: a visible gain, a sound, a small animation. Nothing is "awarded at the end of the week".
3. **Nothing is ever lost.** Experience, levels, unlocked items and progress never go down. There are no penalties, no lives, no "you lost your streak".
4. **Momentum instead of streaks.** A meter that rises when you act and drifts down slowly when you do not. It never resets to zero, rest days do not lower it, and returning after a gap gives a comeback bonus.
5. **Small and visible beats large and distant.** Progress is shown at the size of a step, a task and a day, not only as a far-off goal percentage.
6. **Surprise, used gently.** Occasional unexpected bonuses keep it fresh. They are only ever extra; nothing is withheld to create craving, and nothing is sold.
7. **No comparison with other people.** No leaderboards, no public ranks.
8. **It never changes the plan.** The planner does not know the game exists. Points cannot be earned by picking easy tasks over the ones that matter, because the user does not pick: the plan does.
9. **It can be turned down or off.** Three settings: full, quiet (no sound or animation), off.

## What the user sees

| Element | What it is | Rule it serves |
|---|---|---|
| **Sparks** | Experience points. Earned for each micro-step, each task, reporting friction honestly, accepting a rescue plan | 1, 2 |
| **First spark** | The first step of the day is worth triple | 1 |
| **Level** | Grows with total sparks on a curve that is quick early and slower later. Levels unlock themes and companion looks | 3, 5 |
| **Momentum** | A 0–100 meter, shown as a flame or glow. Rises with any action, decays slowly, never below a floor set by your history | 4 |
| **Today's quest** | The first task in today's plan, presented as one quest with its micro-steps as stages | 5 |
| **Milestone boss** | Each milestone has a health bar; every completed task takes a visible chunk off it | 5 |
| **Journey map** | The goal as a path through its milestones, with your position on it | 5 |
| **Companion** | A small character that reacts to activity and is simply glad to see you after a gap. It never looks sad, hungry or neglected | 3, 4 |
| **Badges** | Marks for things actually done: first goal confirmed, first task started within a minute of opening, came back after a week away, asked for help when stuck | 1, 3 |
| **Surprise bonus** | Now and then a completed step gives extra sparks or a cosmetic | 6 |
| **Comeback** | After several days away: "Welcome back" and a bonus for the first step, then Rescue Mode | 4 |

Honest friction reports earn sparks on purpose. Saying "this is too overwhelming" is the most useful thing a user can tell NOVA, and it should feel like a move in the game, not an admission.

## How it is built

**Game state is a pure function of the event history.**

```
BehaviourEvent[] + StartSession step records ──► computeProgress(events, now) ──► { sparks, level, momentum, badges, bosses }
```

- It lives in `packages/behaviour/momentum.ts`, with the same purity rules as the planner: no clock, no database.
- Because it is derived, it needs **no new tables**. Changing a rule (say, what a step is worth) and recomputing gives everyone a consistent new state. A cached copy may be stored later for speed.
- The one exception to determinism is the surprise bonus. It uses a random source seeded from the event's id, so the same event always gives the same bonus and tests are reproducible.
- The only schema addition is one preference on `User`: `gameMode` (`FULL`, `QUIET`, `OFF`).

### Starting values (tuned in Phase 8b against simulated histories)

| Action | Sparks |
|---|---|
| Micro-step done | 5 |
| First micro-step of the day | 15 |
| Task completed | 10 + 1 per 5 planned minutes |
| Friction reason given | 5 |
| Rescue plan accepted | 20 |
| First step after 3 or more days away | 30 |

Momentum: +12 for the day's first action, +4 for each further action up to +24 a day; decays by 3 a day after two days without activity; floor = 10 + 2 × level, capped at 40.

## What it must not become

- A second to-do list of game chores ("log in daily to claim").
- A source of notifications that guilt the user ("your companion misses you").
- A score that can be raised by breaking tasks into trivial pieces. Micro-steps come from NOVA, not the user, and sparks per task are tied to planned minutes.

## How we will know it works

Measured in the learning-layer backtest and in real use:

- Share of days on which the app is opened.
- Time from opening the app to the first step done.
- Share of planned tasks that get started.

If these do not improve with the layer on compared with off, it is noise and gets simplified.

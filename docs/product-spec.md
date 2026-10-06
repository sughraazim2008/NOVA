# NOVA — Adaptive Goal Execution System

Product specification, transcribed from `PROJECT NOVA.pdf` (section 16, "The single prompt"). This is the original statement of intent. Where it is ambiguous or contradicts itself, [NOVA_PLAN.md](NOVA_PLAN.md) records the resolution and takes precedence.

## 1. Product thesis

NOVA is an adaptive goal-execution system.

It is NOT simply:

- an AI chatbot
- an AI todo list
- a calendar
- a traditional task manager

Its purpose is to solve a deeper problem:

> People often know what they want to accomplish and may even know what they should do, but struggle to translate long-term goals into realistic actions, start difficult tasks, recover after falling behind, and adapt plans to the way they actually behave.

NOVA therefore has four core layers:

1. **Direction** — understand what the user wants.
2. **Planning** — determine what should happen today.
3. **Initiation** — help the user actually begin the task.
4. **Recovery** — adapt when reality causes the original plan to fail.

The core loop is:

```
GOAL
→ AI DECOMPOSITION
→ MILESTONES
→ TASK GRAPH
→ PLANNING ENGINE
→ DAILY PLAN
→ NOVA START
→ USER ACTION
→ BEHAVIOUR
→ FRICTION DETECTION
→ REPLANNING
→ BETTER FUTURE PLAN
```

## 2. Core product example

A user enters:

> "I want to get a software engineering internship by December."

NOVA should understand this as a goal rather than a single task. It should generate structured milestones such as:

1. Prepare
2. Build evidence
3. Find opportunities
4. Apply
5. Interview

These milestones become tasks with descriptions, estimated duration, priority, dependencies, deadlines and status.

The planning engine then determines what the user should work on today based on deadline, available time, priority, dependencies, task duration, goal progress and historical behaviour.

## 3. Critical architecture principle

Separate AI reasoning from deterministic planning.

```
User
  ↓
LLM
  ↓
Structured validated data
  ↓
Deterministic planning engine
  ↓
Daily plan
```

The LLM is responsible for understanding language and generating structured suggestions. The planning engine is responsible for scheduling and prioritisation.

- The LLM must NOT directly decide the final daily schedule.
- The LLM must NOT directly modify database state.
- All LLM output must be schema validated before entering the application.

## 4. Core features

### A. Goal creation

Users can create a goal containing title, description, deadline, priority, available time and optional constraints.

Example: "Build a portfolio by October 31."

### B. AI goal decomposition

Convert Goal → Milestones → Tasks.

Example: Build portfolio → Design → Development → Content → Deployment.

Tasks should contain title, description, estimated duration, priority, dependencies, milestone and deadline.

### C. Task Reality Check

NOVA must evaluate whether generated tasks are actually actionable.

Reject vague tasks such as "Work on portfolio." Convert them into concrete actions such as "Choose the three projects to showcase."

Evaluate tasks for:

- specificity
- actionability
- estimated duration
- dependencies
- ability to begin immediately
- realistic session length

## 5. Planning engine

The planning engine receives available daily capacity, task duration, priority, deadline, dependencies, milestone progress and historical execution behaviour. It outputs a daily plan.

Planning should be deterministic and testable. Do not ask the LLM "What should the user do today?" Instead:

1. Ask the LLM to produce structured information.
2. Validate it.
3. Pass it to the planning engine.
4. Let deterministic logic create the daily plan.

Reference test: with 120 minutes available and tasks A = 60 min, B = 40 min, C = 30 min, the expected plan is A + B.

## 6. NOVA START

This is a signature product feature. A daily task should not be the end of NOVA's responsibility.

Example task: "Write dissertation introduction — 60 minutes."

When the user presses START, NOVA should transform the task into immediate micro-actions:

1. Open dissertation document.
2. Find introduction section.
3. Write the title.
4. Write one sentence describing the problem.
5. Find one supporting source.
6. Add citation.
7. Continue.

The purpose is to reduce the distance between "I should do this" and "I am doing this."

The system should dynamically break tasks down rather than relying only on a static decomposition created when the goal was first generated.

## 7. Friction detection

If the user does not start or repeatedly postpones a task, NOVA should ask: "What is stopping you?"

Possible responses:

- Too overwhelming
- I don't know how to start
- Low energy
- Distracted
- I don't understand the task
- I don't want to do it
- Not enough time

Each response should produce a different system behaviour. Examples:

| Response | Behaviour |
|---|---|
| Too overwhelming | Reduce task size (60 → 30 → 15 → 5-minute starting action) |
| Don't know how to start | Generate smaller micro-actions |
| Low energy | Consider moving demanding work to another time |
| Not enough time | Reduce scope or split the task |
| Task is unclear | Clarify / rewrite the task |

## 8. Adaptive task collapse

Large tasks should be able to dynamically reveal blockers.

Example: "Apply for internship." The user starts. NOVA says "Upload CV." The user discovers their CV is outdated. NOVA should recognise this as a blocker and temporarily create:

```
Update CV
→ find latest experience
→ add project
→ update skills
→ export PDF
```

Once complete, return to the internship application. This should be represented as an adaptive task graph rather than a permanently fixed checklist.

## 9. Behaviour model

Record meaningful execution events:

- `TASK_CREATED`
- `TASK_STARTED`
- `TASK_COMPLETED`
- `TASK_SKIPPED`
- `TASK_POSTPONED`
- `TASK_ABANDONED`
- `FRICTION_REPORTED`
- `ESTIMATE_OVERRUN`
- `ESTIMATE_UNDERRUN`

Store estimated duration, actual duration, number of postponements, number of starts, completion status, reported friction and relevant time/context.

Over time, NOVA should learn patterns, for example:

- Writing tasks: frequently postponed.
- Tasks > 60 minutes: rarely started.
- Tasks < 20 minutes: usually completed.
- After 8pm: lower completion.

The purpose is to model the user's execution behaviour, not simply calculate productivity scores.

## 10. Personal execution model

NOVA should eventually build a model of:

- when the user tends to work
- task types they struggle with
- typical completion duration
- task sizes they start successfully
- common friction causes
- postponement patterns
- estimation errors

This model should influence future planning. Example: if large ambiguous writing tasks are repeatedly postponed, future writing tasks should automatically be made more concrete and smaller.

Illustration: after several sessions the system learns "mathematics tasks: estimate × 1.35", "reading tasks: estimate × 1.10", "tasks started after 20:00: completion probability lower".

## 11. Adaptive replanning

When a task is missed, do not simply move it to tomorrow. Instead:

1. Detect the missed task.
2. Determine whether it is still relevant.
3. Determine why it was missed.
4. Recalculate the plan.
5. Change task size, timing, scope or priority where appropriate.

NOVA should optimise for goal survival rather than perfect adherence to an original schedule.

## 12. Goal health

For every active goal, calculate a projection based on remaining work, remaining time, historical execution, available capacity and dependencies.

Example: Goal "Build portfolio" — projected completion October 29. If the current trajectory becomes insufficient, the goal status is AT RISK. The system should explain the reason rather than simply displaying a warning.

## 13. Goal survival / scope reduction

If a goal becomes unrealistic, NOVA should explore whether the goal can survive through scope reduction.

Example: original — 4 portfolio projects by October 31; current trajectory — not achievable; alternative — 2 strongest projects by October 31.

The system should be able to compare possible plans without automatically deciding the user's priorities.

## 14. What-if simulator

Advanced feature. Allow the user to ask: "What happens if I don't work on this for the next 7 days?" NOVA should simulate the effect and show:

- current projected completion
- projected completion after inactivity
- additional required daily workload
- possible scope reductions
- alternative trajectories

Example: current — October 29; skip 7 days — November 8 (+42 min/day); alternative — reduce scope from 4 projects to 2, new projection October 30.

## 15. Rescue Mode

If a user returns after several days of inactivity, do NOT show "27 overdue tasks." Instead: "You're back. Let's figure out what still matters."

NOVA should classify outstanding work into KEEP, DELETE, DEFER and TODAY, then generate a small recovery plan.

The objective is to prevent backlog accumulation from becoming another reason the user stops using the system.

## 16. MVP

The MVP must prove the following loop:

```
Goal → AI decomposition → Milestones → Tasks → Daily plan → NOVA START → User action → Friction → Replanning
```

MVP features:

1. Authentication
2. Goal creation
3. AI goal decomposition
4. Milestones
5. Tasks
6. Task Reality Check
7. Deterministic daily planner
8. Daily dashboard
9. NOVA START
10. Behaviour events
11. Basic friction detection
12. Adaptive replanning
13. Goal progress

Do NOT build initially: calendar integrations, email integrations, mobile application, voice assistant, social features, autonomous agents, complex ML, team collaboration. Only add these after the core execution loop works.

## 17. Repository architecture

See [NOVA_PLAN.md §6](NOVA_PLAN.md) for the structure as built: `apps/web`, `packages/{types,database,ai,planner,behaviour,simulation}`, `tests/`, `docs/`, `prisma/`.

## 18. Technology

Initial stack: Next.js, TypeScript, PostgreSQL, Prisma, an LLM API, Git/GitHub.

Use a clean separation between frontend, backend, AI, planning, behaviour and database.

## 19. Development milestones

The spec lists M1–M8; the build follows the 13-phase pipeline in [NOVA_PLAN.md §8](NOVA_PLAN.md), which covers the same ground in finer steps.

## 20. Engineering principles

The project should demonstrate real software engineering rather than simply AI-generated code. Prioritise:

- type safety
- modular architecture
- deterministic algorithms
- validation
- unit tests
- integration tests
- clear API boundaries
- database integrity
- error handling
- observability
- documentation

Do not introduce dependencies without justification. Do not rewrite unrelated files. Do not make large architectural changes without explaining them.

## 21. AI development workflow

Claude Code primarily handles architecture, backend, database, AI pipelines, planning algorithms, testing, debugging and refactoring.

Antigravity primarily handles frontend, UI, UX, browser testing, visual iteration and interaction design.

Both tools work on the same Git repository. Do not allow both tools to independently rewrite the same core files without coordination.

## 22. Role of the developer

The developer is the architect and product owner. AI tools are implementation assistants. The developer must understand:

- why the architecture exists
- how the planning algorithm works
- how AI output is validated
- how behavioural data affects planning
- why a task is selected
- how replanning works

Do not generate thousands of lines of code without understanding the system. Before implementing major features, explain architecture, data flow, files affected, algorithm, tests and failure cases.

## 23. First instruction

Do NOT start writing the application immediately. First:

1. Analyse this specification.
2. Identify ambiguities.
3. Propose the architecture.
4. Propose the database schema.
5. Define the API boundaries.
6. Define the core domain types.
7. Define the planning engine interface.
8. Define the AI/LLM interfaces.
9. Define the behaviour-event model.
10. Define the testing strategy.
11. Propose the implementation order.
12. Identify risks and architectural trade-offs.

Do not implement until the architecture has been reviewed. After architecture approval, implement one milestone at a time.

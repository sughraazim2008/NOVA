"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, EmptyState, ErrorNote } from "@/components/ui";
import { DoneBurst } from "@/components/ui/done-burst";
import { api } from "@/lib/api";
import { formatMinutes } from "@/lib/format";
import { useMutation } from "@/lib/use-mutation";
import type { PlanEntry, TodayPlan } from "@/server/services/planning";

const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const emptyMessages: Record<NonNullable<TodayPlan["emptyReason"]>, { title: string; body: string }> = {
  NO_GOALS: { title: "Nothing to plan yet", body: "Create a goal and NOVA will work out what to do first." },
  ALL_DONE: { title: "Everything is done", body: "Every task in your active goals is finished." },
  NO_CAPACITY: { title: "No time set aside today", body: "Your minutes a day are set to zero. Change them on a goal to get a plan." },
  NOTHING_ELIGIBLE: { title: "Nothing can be started today", body: "What is left is waiting on other tasks or has been moved to a later date." },
};

export function TodayView({ plan }: { plan: TodayPlan }) {
  const { run, pending, error } = useMutation();
  // The task just marked done, so the reward shows at once instead of after the server answers.
  const [justDone, setJustDone] = useState<string | null>(null);

  const act = (taskId: string, action: "start" | "complete" | "reopen" | "skip" | "postpone") => {
    if (action === "complete") setJustDone(taskId);
    return run(() => api(`/tasks/${taskId}/${action}`, { method: "POST" })).finally(() => setJustDone(null));
  };

  const open = plan.entries.filter((entry) => entry.outcome === "PENDING" && entry.taskId !== justDone);
  const handled = plan.entries.filter((entry) => entry.outcome !== "PENDING" || entry.taskId === justDone);
  const [focus, ...upNext] = open;
  const finishedCount = handled.filter((entry) => entry.outcome === "COMPLETED" || entry.taskId === justDone).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-neutral-500">{dayFormat.format(new Date(`${plan.date}T00:00:00.000Z`))}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        {plan.entries.length > 0 ? (
          <p className="mt-1 text-sm text-neutral-600">
            {formatMinutes(plan.usedMin)} of {formatMinutes(plan.capacityMin)} planned
            {finishedCount > 0 ? ` · ${finishedCount} of ${plan.entries.length} done` : ""}
          </p>
        ) : null}
      </header>

      <ErrorNote message={error} />

      {plan.emptyReason ? (
        <EmptyState title={emptyMessages[plan.emptyReason].title}>
          {emptyMessages[plan.emptyReason].body}{" "}
          <Link href={plan.emptyReason === "NO_GOALS" ? "/goals/new" : "/goals"} className="text-indigo-600 underline">
            {plan.emptyReason === "NO_GOALS" ? "Create a goal" : "Open your goals"}
          </Link>
        </EmptyState>
      ) : null}

      {focus ? <FocusCard entry={focus} pending={pending} act={act} /> : null}

      {!focus && plan.entries.length > 0 ? (
        <Card className="flex items-center gap-4">
          <DoneBurst size={44} label="All done" />
          <div>
            <p className="font-medium text-neutral-900">That is today done.</p>
            <p className="text-sm text-neutral-600">Nothing else is planned. Rest, or rebuild the plan if you want more.</p>
          </div>
        </Card>
      ) : null}

      {upNext.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-neutral-500">Then</h2>
          <ul className="flex flex-col gap-2">
            {upNext.map((entry) => (
              <NextRow key={entry.id} entry={entry} pending={pending} act={act} />
            ))}
          </ul>
        </section>
      ) : null}

      {handled.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-neutral-500">Already handled</h2>
          <ul className="flex flex-col gap-1.5">
            {handled.map((entry) => (
              <HandledRow key={entry.id} entry={entry} celebrating={entry.taskId === justDone} pending={pending} act={act} />
            ))}
          </ul>
        </section>
      ) : null}

      {plan.needsSplit.length > 0 ? (
        <section className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Too big for one day</p>
          <ul className="mt-1 flex flex-col gap-1">
            {plan.needsSplit.map(({ task, goal }) => (
              <li key={task.id}>
                {task.title} ({formatMinutes(task.estimatedMin)}).{" "}
                <Link href={`/goals/${goal.id}`} className="underline">Split it into smaller tasks</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!plan.emptyReason || plan.emptyReason === "NOTHING_ELIGIBLE" ? (
        <div>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => api("/plan/today/regenerate", { method: "POST" }))}>
            Rebuild today&apos;s plan
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type Act = (taskId: string, action: "start" | "complete" | "reopen" | "skip" | "postpone") => Promise<boolean>;

/** The one thing to do now. Everything about this card should make the next action obvious. */
function FocusCard({ entry, pending, act }: { entry: PlanEntry; pending: boolean; act: Act }) {
  const [showWhy, setShowWhy] = useState(false);
  const started = entry.task.status === "IN_PROGRESS";
  return (
    <Card className="nova-rise border-indigo-200 shadow-sm ring-1 ring-indigo-100">
      <p className="text-xs font-medium tracking-wide text-indigo-700 uppercase">{started ? "In progress" : "Start here"}</p>
      <h2 className="mt-1 text-xl font-semibold text-neutral-900">{entry.task.title}</h2>
      <p className="mt-1 text-sm text-neutral-500">
        {formatMinutes(entry.plannedMin)} · {entry.goal.title}
      </p>
      {entry.task.description ? <p className="mt-2 text-sm text-neutral-700">{entry.task.description}</p> : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {started ? (
          <Button variant="primary" className="px-6 py-3 text-base" disabled={pending} onClick={() => act(entry.taskId, "complete")}>
            Done
          </Button>
        ) : (
          <Button variant="primary" className="px-8 py-3 text-base" disabled={pending} onClick={() => act(entry.taskId, "start")}>
            Start
          </Button>
        )}
        {!started ? (
          <Button variant="ghost" disabled={pending} onClick={() => act(entry.taskId, "complete")}>Already done</Button>
        ) : null}
        <Button variant="ghost" disabled={pending} onClick={() => act(entry.taskId, "skip")}>Not today</Button>
        <Button variant="ghost" disabled={pending} onClick={() => act(entry.taskId, "postpone")}>Tomorrow</Button>
      </div>

      <button type="button" onClick={() => setShowWhy((shown) => !shown)} aria-expanded={showWhy} className="mt-4 text-xs text-neutral-500 underline-offset-2 hover:underline">
        {showWhy ? "Hide why" : "Why this first?"}
      </button>
      {showWhy ? <p className="mt-1 text-sm text-neutral-600">{entry.reason}</p> : null}
    </Card>
  );
}

function NextRow({ entry, pending, act }: { entry: PlanEntry; pending: boolean; act: Act }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-neutral-900">{entry.task.title}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {formatMinutes(entry.plannedMin)} · {entry.goal.title}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setOpen((shown) => !shown)} aria-expanded={open}>
          {open ? "Close" : "More"}
        </Button>
      </div>
      {open ? (
        <div className="mt-2">
          <p className="text-sm text-neutral-600">{entry.reason}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button size="sm" disabled={pending} onClick={() => act(entry.taskId, "complete")}>Done</Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(entry.taskId, "skip")}>Not today</Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(entry.taskId, "postpone")}>Tomorrow</Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

const outcomeLabel: Record<PlanEntry["outcome"], string> = {
  PENDING: "",
  COMPLETED: "Done",
  PARTIAL: "Partly done",
  SKIPPED: "Not today",
  POSTPONED: "Moved to tomorrow or later",
  MISSED: "Not reached",
};

function HandledRow({ entry, celebrating, pending, act }: { entry: PlanEntry; celebrating: boolean; pending: boolean; act: Act }) {
  const done = celebrating || entry.outcome === "COMPLETED";
  return (
    <li className="flex items-center gap-3 rounded-lg px-1 py-1.5">
      {done ? (
        celebrating ? <DoneBurst size={22} /> : (
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white" aria-hidden>
            <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
        )
      ) : (
        <span className="h-[22px] w-[22px] shrink-0 rounded-full border border-neutral-300" aria-hidden />
      )}
      <p className={`min-w-0 flex-1 text-sm ${done ? "text-neutral-500 line-through" : "text-neutral-500"}`}>{entry.task.title}</p>
      <span className="shrink-0 text-xs text-neutral-400">{celebrating ? "Done" : outcomeLabel[entry.outcome]}</span>
      {entry.outcome === "COMPLETED" && !celebrating ? (
        <Button variant="ghost" size="sm" className="shrink-0" disabled={pending} onClick={() => act(entry.taskId, "reopen")}>Undo</Button>
      ) : null}
    </li>
  );
}

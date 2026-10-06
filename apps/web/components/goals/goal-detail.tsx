"use client";

import type { GoalTree } from "@nova/database";
import type { Milestone, Task } from "@nova/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, EmptyState, ErrorNote, Input, ProgressBar } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatMinutes, label } from "@/lib/format";
import { useMutation } from "@/lib/use-mutation";
import type { Progress } from "@/server/services/goals";
import { GoalForm } from "./goal-form";
import { TaskForm } from "./task-form";
import { TaskRow } from "./task-row";

type Tree = GoalTree & { progress: Progress };

export function GoalDetail({ tree }: { tree: Tree }) {
  const { goal, milestones, dependencies, progress } = tree;
  const router = useRouter();
  const { run, pending, error } = useMutation();
  const [editing, setEditing] = useState(false);

  const allTasks = milestones.flatMap((milestone) => milestone.tasks);
  const prerequisitesOf = (taskId: string) => dependencies.filter((d) => d.taskId === taskId).map((d) => d.dependsOnTaskId);

  async function remove() {
    if (!window.confirm(`Delete "${goal.title}" and everything in it? This cannot be undone.`)) return;
    let deleted = false;
    try {
      await api(`/goals/${goal.id}`, { method: "DELETE" });
      deleted = true;
    } finally {
      if (deleted) router.push("/goals");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/goals" className="text-sm text-neutral-500 hover:text-neutral-800">
        ← All goals
      </Link>

      <Card>
        {editing ? (
          <GoalForm goal={goal} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{goal.title}</h1>
              <div className="flex shrink-0 gap-1.5">
                {goal.status !== "ACTIVE" ? <Badge>{label(goal.status)}</Badge> : null}
                <Badge tone={goal.priority === "CRITICAL" ? "red" : goal.priority === "HIGH" ? "amber" : "neutral"}>
                  {label(goal.priority)}
                </Badge>
              </div>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              Due {formatDate(goal.deadline)} · {formatMinutes(goal.dailyCapacityMin)} a day
            </p>
            {goal.description ? <p className="mt-3 text-sm text-neutral-700">{goal.description}</p> : null}
            {goal.constraints ? <p className="mt-2 text-sm text-neutral-500">Constraints: {goal.constraints}</p> : null}
            <div className="mt-4 flex items-center gap-3">
              <ProgressBar percent={progress.percent} label="Goal progress" />
              <span className="w-10 shrink-0 text-right text-sm tabular-nums text-neutral-600">{progress.percent}%</span>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {progress.taskCount === 0
                ? "No tasks yet"
                : `${progress.doneCount} of ${progress.taskCount} tasks done · ${formatMinutes(progress.totalMin - progress.doneMin)} of work left`}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setEditing(true)}>Edit goal</Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => api(`/goals/${goal.id}`, { method: "PATCH", body: { status: goal.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" } }))}
              >
                {goal.status === "ACTIVE" ? "Archive" : "Reactivate"}
              </Button>
              <Button size="sm" variant="danger" disabled={pending} onClick={remove}>Delete</Button>
            </div>
            <div className="mt-3"><ErrorNote message={error} /></div>
          </>
        )}
      </Card>

      {milestones.length === 0 ? (
        <EmptyState title="Break the goal into milestones">
          A milestone is a stage on the way, such as Design, Build or Launch. Add the first one below.
        </EmptyState>
      ) : null}

      {milestones.map((milestone, index) => (
        <MilestoneSection
          key={milestone.id}
          number={index + 1}
          milestone={milestone}
          allTasks={allTasks}
          prerequisitesOf={prerequisitesOf}
        />
      ))}

      <AddMilestone goalId={goal.id} />
    </div>
  );
}

function MilestoneSection({
  number,
  milestone,
  allTasks,
  prerequisitesOf,
}: {
  number: number;
  milestone: Milestone & { tasks: Task[] };
  allTasks: Task[];
  prerequisitesOf: (taskId: string) => string[];
}) {
  const { run, pending, error } = useMutation();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(milestone.title);
  const done = milestone.tasks.filter((t) => t.status === "DONE").length;

  async function rename(event: FormEvent) {
    event.preventDefault();
    if (await run(() => api(`/milestones/${milestone.id}`, { method: "PATCH", body: { title } }))) setRenaming(false);
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        {renaming ? (
          <form onSubmit={rename} className="flex flex-1 gap-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Milestone title" required maxLength={200} autoFocus />
            <Button type="submit" variant="primary" size="sm" disabled={pending}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>Cancel</Button>
          </form>
        ) : (
          <>
            <h2 className="font-medium text-neutral-900">
              <span className="text-neutral-400">{number}.</span> {milestone.title}
              {milestone.tasks.length > 0 ? (
                <span className="ml-2 text-sm font-normal text-neutral-500">{done}/{milestone.tasks.length}</span>
              ) : null}
            </h2>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>Rename</Button>
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Delete "${milestone.title}" and its ${milestone.tasks.length} tasks?`)) {
                    void run(() => api(`/milestones/${milestone.id}`, { method: "DELETE" }));
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </>
        )}
      </div>

      {milestone.tasks.length > 0 ? (
        <ul className="mt-2 divide-y divide-neutral-100">
          {milestone.tasks.map((task) => (
            <TaskRow key={task.id} task={task} allTasks={allTasks} prerequisiteIds={prerequisitesOf(task.id)} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">No tasks yet. Add the first concrete action.</p>
      )}

      <div className="mt-4 border-t border-neutral-100 pt-4">
        <TaskForm
          submitLabel="Add task"
          pending={pending}
          onSubmit={({ deadline, ...values }) =>
            run(() =>
              api(`/milestones/${milestone.id}/tasks`, { method: "POST", body: { ...values, ...(deadline ? { deadline } : {}) } }),
            )
          }
        />
        <div className="mt-3"><ErrorNote message={error} /></div>
      </div>
    </Card>
  );
}

function AddMilestone({ goalId }: { goalId: string }) {
  const { run, pending, error } = useMutation();
  const [title, setTitle] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await run(() => api(`/goals/${goalId}/milestones`, { method: "POST", body: { title } }))) setTitle("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New milestone, e.g. Build evidence" aria-label="New milestone title" required maxLength={200} />
        <Button type="submit" disabled={pending} className="shrink-0">Add milestone</Button>
      </div>
      <ErrorNote message={error} />
    </form>
  );
}

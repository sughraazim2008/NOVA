"use client";

import type { Task } from "@nova/types";
import { useState } from "react";
import { Badge, Button, ErrorNote, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatMinutes, label } from "@/lib/format";
import { useMutation } from "@/lib/use-mutation";
import { TaskForm } from "./task-form";

const statuses = ["TODO", "IN_PROGRESS", "DONE", "DEFERRED", "DROPPED"] as const;
const finished = (task: Task) => task.status === "DONE" || task.status === "DROPPED";

export function TaskRow({
  task,
  allTasks,
  prerequisiteIds,
}: {
  task: Task;
  /** Every task in the goal, for choosing and naming prerequisites. */
  allTasks: Task[];
  prerequisiteIds: string[];
}) {
  const { run, pending, error, clearError } = useMutation();
  const [editing, setEditing] = useState(false);
  const [deferDate, setDeferDate] = useState(task.deferredUntil ?? "");

  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const prerequisites = prerequisiteIds.flatMap((id) => byId.get(id) ?? []);
  const waitingOn = prerequisites.filter((t) => !finished(t));
  const candidates = allTasks.filter((t) => t.id !== task.id && !prerequisiteIds.includes(t.id));
  const done = task.status === "DONE";

  const patch = (body: unknown) => run(() => api(`/tasks/${task.id}`, { method: "PATCH", body }));
  const dependency = (method: "POST" | "DELETE", dependsOnTaskId: string) =>
    run(() => api(`/tasks/${task.id}/dependencies`, { method, body: { dependsOnTaskId } }));

  function changeStatus(status: Task["status"]) {
    if (status !== "DEFERRED") return void patch({ status });
    if (deferDate) void patch({ status, deferredUntil: deferDate });
  }

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          disabled={pending}
          onChange={() => patch({ status: done ? "TODO" : "DONE" })}
          aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          className="mt-1 h-4 w-4 shrink-0 rounded border-neutral-300 accent-indigo-600"
        />
        <div className="min-w-0 flex-1">
          <p className={done || task.status === "DROPPED" ? "text-neutral-400 line-through" : "text-neutral-900"}>{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
            <span>{formatMinutes(task.estimatedMin)}</span>
            <span>· {label(task.category)}</span>
            {task.deadline ? <span>· due {formatDate(task.deadline)}</span> : null}
            {task.priority === "HIGH" || task.priority === "CRITICAL" ? (
              <Badge tone={task.priority === "CRITICAL" ? "red" : "amber"}>{label(task.priority)}</Badge>
            ) : null}
            {task.status === "IN_PROGRESS" ? <Badge tone="indigo">In progress</Badge> : null}
            {task.status === "DEFERRED" && task.deferredUntil ? <Badge>Deferred to {formatDate(task.deferredUntil)}</Badge> : null}
            {task.status === "DROPPED" ? <Badge>Dropped</Badge> : null}
          </div>
          {waitingOn.length > 0 && !finished(task) ? (
            <p className="mt-1 text-xs text-amber-700">Waiting on: {waitingOn.map((t) => t.title).join(", ")}</p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clearError();
            setEditing((open) => !open);
          }}
          aria-expanded={editing}
        >
          {editing ? "Close" : "Edit"}
        </Button>
      </div>

      {editing ? (
        <div className="mt-3 ml-7 flex flex-col gap-4 rounded-lg bg-neutral-50 p-4">
          <TaskForm
            task={task}
            submitLabel="Save"
            pending={pending}
            onSubmit={async (values) => {
              const saved = await patch(values);
              if (saved) setEditing(false);
              return saved;
            }}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select value={task.status} disabled={pending} onChange={(event) => changeStatus(event.target.value as Task["status"])}>
                {statuses.map((value) => (
                  <option key={value} value={value} disabled={value === "DEFERRED" && !deferDate}>
                    {label(value)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Defer until" hint="Pick a date, then choose Deferred.">
              <Input type="date" value={deferDate} onChange={(event) => setDeferDate(event.target.value)} />
            </Field>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">Must be finished first</p>
            {prerequisites.length === 0 ? <p className="text-xs text-neutral-500">Nothing. This task can start any time.</p> : null}
            <ul className="flex flex-wrap gap-2">
              {prerequisites.map((prerequisite) => (
                <li key={prerequisite.id} className="flex items-center gap-1 rounded-full bg-white py-0.5 pr-1 pl-3 text-xs ring-1 ring-neutral-200">
                  {prerequisite.title}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => dependency("DELETE", prerequisite.id)}
                    aria-label={`Remove prerequisite "${prerequisite.title}"`}
                    className="rounded-full px-1.5 text-neutral-500 hover:bg-neutral-100"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            {candidates.length > 0 ? (
              <Select
                value=""
                disabled={pending}
                onChange={(event) => event.target.value && dependency("POST", event.target.value)}
                aria-label="Add a prerequisite"
                className="mt-2"
              >
                <option value="">Add a task that must come first…</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
                ))}
              </Select>
            ) : null}
          </div>

          <ErrorNote message={error} />

          <div>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Delete "${task.title}"? This cannot be undone.`)) {
                  void run(() => api(`/tasks/${task.id}`, { method: "DELETE" }));
                }
              }}
            >
              Delete task
            </Button>
          </div>
        </div>
      ) : (
        <div className="ml-7">
          <ErrorNote message={error} />
        </div>
      )}
    </li>
  );
}

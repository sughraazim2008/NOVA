"use client";

import type { DraftTask, Goal, GoalDraft } from "@nova/types";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Card, ErrorNote, Field, Input, Select } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { formatMinutes, label } from "@/lib/format";

const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

/**
 * The review step: nothing the AI proposed is saved until the person has seen it here,
 * changed what they want, and pressed save.
 */
export function DraftReview({ initial, onStartOver }: { initial: GoalDraft; onStartOver: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextUserKey, setNextUserKey] = useState(1);

  // What the AI originally proposed, sent along on save so the edits can be learned from.
  const aiTitles = useMemo(
    () => initial.tasks.map((task) => ({ key: task.key, title: task.realityCheck?.original ?? task.title })),
    [initial],
  );
  const titleOf = useMemo(() => new Map(draft.tasks.map((task) => [task.key, task.title])), [draft.tasks]);
  const totalMin = draft.tasks.reduce((sum, task) => sum + (task.estimatedMin || 0), 0);
  const changed = draft.tasks.filter((task) => task.realityCheck && task.realityCheck.verdict !== "PASS").length;

  const setGoal = (patch: Partial<GoalDraft["goal"]>) => setDraft((d) => ({ ...d, goal: { ...d.goal, ...patch } }));
  const setTask = (key: string, patch: Partial<DraftTask>) =>
    setDraft((d) => ({ ...d, tasks: d.tasks.map((task) => (task.key === key ? { ...task, ...patch } : task)) }));
  const removeTasks = (keys: Set<string>) =>
    setDraft((d) => ({
      ...d,
      tasks: d.tasks.filter((task) => !keys.has(task.key)).map((task) => ({ ...task, dependsOn: task.dependsOn.filter((key) => !keys.has(key)) })),
    }));

  function removeMilestone(milestoneKey: string) {
    removeTasks(new Set(draft.tasks.filter((task) => task.milestoneKey === milestoneKey).map((task) => task.key)));
    setDraft((d) => ({ ...d, milestones: d.milestones.filter((milestone) => milestone.key !== milestoneKey) }));
  }

  function addTask(milestoneKey: string, title: string, estimatedMin: number) {
    const task: DraftTask = {
      key: `user-${nextUserKey}`,
      milestoneKey,
      title,
      description: null,
      estimatedMin,
      priority: "MEDIUM",
      category: "OTHER",
      energyDemand: "MEDIUM",
      deadline: null,
      dependsOn: [],
      source: "USER",
      realityCheck: null,
    };
    setNextUserKey((n) => n + 1);
    setDraft((d) => ({ ...d, tasks: [...d.tasks, task] }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const goal = await api<Goal>("/goals/confirm", { method: "POST", body: { draft, aiTitles } });
      router.push(`/goals/${goal.id}`);
    } catch (caught) {
      setError(describeError(caught));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <p className="text-sm font-medium text-indigo-700">Review before saving</p>
        <p className="mt-1 text-sm text-neutral-600">
          Nothing is saved yet. Change anything that looks wrong, delete what you do not need, then save.
        </p>
        {draft.notes.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1.5">
            {draft.notes.map((note) => (
              <li key={note} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{note}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Goal">
            <Input value={draft.goal.title} onChange={(event) => setGoal({ title: event.target.value })} maxLength={200} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Deadline">
              <Input type="date" value={draft.goal.deadline} onChange={(event) => event.target.value && setGoal({ deadline: event.target.value })} />
            </Field>
            <Field label="Priority">
              <Select value={draft.goal.priority} onChange={(event) => setGoal({ priority: event.target.value as GoalDraft["goal"]["priority"] })}>
                {priorities.map((value) => (
                  <option key={value} value={value}>{label(value)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Minutes a day">
              <Input
                type="number"
                min={5}
                max={960}
                step={5}
                value={draft.goal.dailyCapacityMin}
                onChange={(event) => setGoal({ dailyCapacityMin: Number(event.target.value) })}
              />
            </Field>
          </div>
        </div>
      </Card>

      {draft.milestones.map((milestone, index) => {
        const tasks = draft.tasks.filter((task) => task.milestoneKey === milestone.key);
        return (
          <Card key={milestone.key}>
            <div className="flex items-center gap-2">
              <span className="text-neutral-400">{index + 1}.</span>
              <Input
                value={milestone.title}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, milestones: d.milestones.map((m) => (m.key === milestone.key ? { ...m, title: event.target.value } : m)) }))
                }
                aria-label={`Milestone ${index + 1} title`}
                maxLength={200}
                className="font-medium"
              />
              <Button
                variant="danger"
                size="sm"
                className="shrink-0"
                disabled={draft.milestones.length === 1}
                onClick={() => removeMilestone(milestone.key)}
              >
                Remove
              </Button>
            </div>

            <ul className="mt-3 divide-y divide-neutral-100">
              {tasks.map((task) => (
                <DraftTaskRow
                  key={task.key}
                  task={task}
                  prerequisites={task.dependsOn.flatMap((key) => titleOf.get(key) ?? [])}
                  onChange={(patch) => setTask(task.key, patch)}
                  onRemove={() => removeTasks(new Set([task.key]))}
                />
              ))}
            </ul>
            {tasks.length === 0 ? <p className="mt-3 text-sm text-neutral-500">No tasks in this milestone.</p> : null}

            <AddDraftTask onAdd={(title, minutes) => addTask(milestone.key, title, minutes)} />
          </Card>
        );
      })}

      <div className="sticky bottom-0 -mx-4 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur">
        <ErrorNote message={error} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save this plan"}
          </Button>
          <Button variant="ghost" onClick={onStartOver} disabled={saving}>
            Start over
          </Button>
          <p className="text-sm text-neutral-500">
            {draft.tasks.length} tasks · {formatMinutes(totalMin)}
            {changed > 0 ? ` · ${changed} adjusted by the reality check` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function DraftTaskRow({
  task,
  prerequisites,
  onChange,
  onRemove,
}: {
  task: DraftTask;
  prerequisites: string[];
  onChange: (patch: Partial<DraftTask>) => void;
  onRemove: () => void;
}) {
  const check = task.realityCheck;
  return (
    <li className="py-3">
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input value={task.title} onChange={(event) => onChange({ title: event.target.value })} aria-label="Task title" maxLength={200} />
        </div>
        <div className="w-20 shrink-0">
          <Input
            type="number"
            min={1}
            max={480}
            value={task.estimatedMin}
            onChange={(event) => onChange({ estimatedMin: Number(event.target.value) })}
            aria-label="Estimated minutes"
            title="Estimated minutes"
          />
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={onRemove} aria-label={`Remove "${task.title}"`}>
          ✕
        </Button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
        <span>{label(task.category)}</span>
        {task.source === "USER" ? <Badge tone="indigo">Added by you</Badge> : null}
        {prerequisites.length > 0 ? <span>· after: {prerequisites.join("; ")}</span> : null}
      </div>

      {check && (check.verdict === "REWRITTEN" || check.verdict === "SPLIT") ? (
        <p className="mt-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900">
          <span className="font-medium">{check.verdict === "SPLIT" ? "Split from" : "Rewritten from"}</span>{" "}
          <span className="line-through">{check.original}</span>
          {check.reason ? ` — ${check.reason}` : ""}
        </p>
      ) : null}
      {check?.verdict === "FLAGGED" ? (
        <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <span className="font-medium">Worth a second look:</span> {check.reason}
        </p>
      ) : null}
    </li>
  );
}

function AddDraftTask({ onAdd }: { onAdd: (title: string, minutes: number) => void }) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("30");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), Number(minutes) || 30);
    setTitle("");
  }

  return (
    <form onSubmit={submit} className="mt-3 flex gap-2 border-t border-neutral-100 pt-3">
      <div className="min-w-0 flex-1">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a task of your own" aria-label="New task title" maxLength={200} />
      </div>
      <div className="w-20 shrink-0">
        <Input type="number" min={1} max={480} value={minutes} onChange={(event) => setMinutes(event.target.value)} aria-label="New task minutes" />
      </div>
      <Button type="submit" size="sm" className="shrink-0">Add</Button>
    </form>
  );
}

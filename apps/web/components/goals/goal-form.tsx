"use client";

import type { Goal } from "@nova/types";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ErrorNote, Field, Input, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useMutation } from "@/lib/use-mutation";

const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

/** Creates a goal, or edits the one passed in. */
export function GoalForm({ goal, onDone }: { goal?: Goal; onDone?: () => void }) {
  const router = useRouter();
  const { run, pending, error } = useMutation();
  const [form, setForm] = useState({
    title: goal?.title ?? "",
    description: goal?.description ?? "",
    deadline: goal?.deadline ?? "",
    priority: goal?.priority ?? "MEDIUM",
    dailyCapacityMin: String(goal?.dailyCapacityMin ?? 60),
    constraints: goal?.constraints ?? "",
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = (value: string) => value.trim();
    const shared = {
      title: form.title,
      deadline: form.deadline,
      priority: form.priority,
      dailyCapacityMin: Number(form.dailyCapacityMin),
    };
    if (goal) {
      const body = { ...shared, description: text(form.description) || null, constraints: text(form.constraints) || null };
      if (await run(() => api(`/goals/${goal.id}`, { method: "PATCH", body }))) onDone?.();
      return;
    }
    const body = {
      ...shared,
      ...(text(form.description) ? { description: form.description } : {}),
      ...(text(form.constraints) ? { constraints: form.constraints } : {}),
    };
    let createdId = "";
    const created = await run(async () => {
      createdId = (await api<Goal>("/goals", { method: "POST", body })).id;
    });
    if (created) router.push(`/goals/${createdId}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="What do you want to achieve?">
        <Input value={form.title} onChange={set("title")} placeholder="Build a portfolio" required maxLength={200} autoFocus={!goal} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Deadline">
          <Input type="date" value={form.deadline} onChange={set("deadline")} required />
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={set("priority")}>
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Minutes a day">
          <Input type="number" min={5} max={960} step={5} value={form.dailyCapacityMin} onChange={set("dailyCapacityMin")} required />
        </Field>
      </div>
      <Field label="Details" hint="Optional. What does done look like?">
        <Textarea value={form.description} onChange={set("description")} maxLength={2000} />
      </Field>
      <Field label="Constraints" hint="Optional. Anything that limits when or how you can work on this.">
        <Input value={form.constraints} onChange={set("constraints")} maxLength={1000} />
      </Field>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {goal ? "Save changes" : "Create goal"}
        </Button>
        {onDone ? (
          <Button variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

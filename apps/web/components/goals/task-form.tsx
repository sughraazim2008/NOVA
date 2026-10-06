"use client";

import type { Task } from "@nova/types";
import { useState, type FormEvent } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { label } from "@/lib/format";

const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const categories = ["WRITING", "READING", "STUDY", "PRACTICE", "CODING", "RESEARCH", "ADMIN", "COMMUNICATION", "PLANNING", "OTHER"] as const;
const energies = ["LOW", "MEDIUM", "HIGH"] as const;

export interface TaskFormValues {
  title: string;
  estimatedMin: number;
  priority: Task["priority"];
  category: Task["category"];
  energyDemand: Task["energyDemand"];
  deadline: string | null;
}

/** Fields shared by "add task" and "edit task". The caller decides what submitting does. */
export function TaskForm({
  task,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  task?: Task;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: TaskFormValues) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const initial = {
    title: task?.title ?? "",
    estimatedMin: String(task?.estimatedMin ?? 30),
    priority: task?.priority ?? "MEDIUM",
    category: task?.category ?? "OTHER",
    energyDemand: task?.energyDemand ?? "MEDIUM",
    deadline: task?.deadline ?? "",
  };
  const [form, setForm] = useState(initial);
  const [showMore, setShowMore] = useState(Boolean(task));
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const saved = await onSubmit({
      title: form.title,
      estimatedMin: Number(form.estimatedMin),
      priority: form.priority as Task["priority"],
      category: form.category as Task["category"],
      energyDemand: form.energyDemand as Task["energyDemand"],
      deadline: form.deadline || null,
    });
    if (saved && !task) setForm(initial);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input
            value={form.title}
            onChange={set("title")}
            placeholder="A concrete action, e.g. Choose the three projects to showcase"
            aria-label="Task title"
            required
            maxLength={200}
          />
        </div>
        <div className="w-20 shrink-0">
          <Input
            type="number"
            min={1}
            max={480}
            value={form.estimatedMin}
            onChange={set("estimatedMin")}
            aria-label="Estimated minutes"
            title="Estimated minutes"
            required
          />
        </div>
      </div>
      {showMore ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Priority">
            <Select value={form.priority} onChange={set("priority")}>
              {priorities.map((value) => (
                <option key={value} value={value}>{label(value)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Kind of work">
            <Select value={form.category} onChange={set("category")}>
              {categories.map((value) => (
                <option key={value} value={value}>{label(value)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Energy needed">
            <Select value={form.energyDemand} onChange={set("energyDemand")}>
              {energies.map((value) => (
                <option key={value} value={value}>{label(value)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Own deadline">
            <Input type="date" value={form.deadline} onChange={set("deadline")} />
          </Field>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
        {!showMore ? (
          <Button variant="ghost" size="sm" onClick={() => setShowMore(true)}>
            More options
          </Button>
        ) : null}
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

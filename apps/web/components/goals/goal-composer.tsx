"use client";

import type { GoalDraft } from "@nova/types";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, ErrorNote, Field, Input, Textarea } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import type { AIStatus } from "@/server/services/decomposition";
import { DraftReview } from "./draft-review";
import { GoalForm } from "./goal-form";

const STAGES = ["Reading your goal…", "Sketching the milestones…", "Writing the tasks…", "Checking each task can actually be started…"];

/** New goal: describe it in a sentence and review what NOVA proposes, or build it by hand. */
export function GoalComposer({ status, defaultMinutes }: { status: AIStatus; defaultMinutes: number }) {
  const [mode, setMode] = useState<"describe" | "manual">("describe");
  const [text, setText] = useState("");
  const [deadline, setDeadline] = useState("");
  const [minutes, setMinutes] = useState(String(defaultMinutes));
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GoalDraft | null>(null);

  // The stages are a pacing aid while several model calls run; they are not reported by the server.
  useEffect(() => {
    if (!loading) return;
    setStage(0);
    const timer = setInterval(() => setStage((current) => Math.min(current + 1, STAGES.length - 1)), 4000);
    return () => clearInterval(timer);
  }, [loading]);

  async function generate(sentence: string) {
    setLoading(true);
    setError(null);
    try {
      const body = { text: sentence, ...(deadline ? { deadline } : {}), ...(minutes ? { dailyCapacityMin: Number(minutes) } : {}) };
      setDraft(await api<GoalDraft>("/goals/decompose", { method: "POST", body }));
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void generate(text);
  }

  if (draft) return <DraftReview initial={draft} onStartOver={() => setDraft(null)} />;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="How to create the goal" className="flex gap-1 self-start rounded-lg bg-neutral-100 p-1 text-sm">
        {(["describe", "manual"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-md px-3 py-1.5 font-medium ${mode === value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
          >
            {value === "describe" ? "Describe it" : "Build by hand"}
          </button>
        ))}
      </div>

      {mode === "manual" ? (
        <Card><GoalForm /></Card>
      ) : (
        <Card>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="What do you want to achieve?" hint="One or two sentences. Say when you want it done by, if you know.">
              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="I want to get a software engineering internship by December."
                required
                minLength={8}
                maxLength={2000}
                disabled={loading}
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Deadline" hint="Optional if your sentence says it.">
                <Input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} disabled={loading} />
              </Field>
              <Field label="Minutes a day">
                <Input type="number" min={5} max={960} step={5} value={minutes} onChange={(event) => setMinutes(event.target.value)} disabled={loading} />
              </Field>
            </div>

            {status.mode === "sample" ? (
              <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <p className="font-medium">No AI model is connected yet.</p>
                <p className="mt-1">These examples show how it works, using plans written in advance:</p>
                <div className="mt-2 flex flex-col items-start gap-1.5">
                  {status.examples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setText(example);
                        void generate(example);
                      }}
                      className="rounded-md bg-white px-2.5 py-1 text-left text-sm text-neutral-800 ring-1 ring-amber-200 hover:bg-amber-100"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <ErrorNote message={error} />

            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? "Working…" : "Break it down"}
              </Button>
              {loading ? <p role="status" className="text-sm text-neutral-600">{STAGES[stage]}</p> : null}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

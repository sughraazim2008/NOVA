"use client";

import { FRICTION_OPTIONS } from "@nova/behaviour";
import type { FrictionReason } from "@nova/types";
import { useState } from "react";
import { Button, ErrorNote, Input } from "@/components/ui";
import { api, describeError } from "@/lib/api";

/**
 * "What got in the way?" One tap answers it; a note is optional; it can always be dismissed.
 * An honest answer here is the most useful thing a user can tell NOVA, so it is never framed as a failure.
 */
export function FrictionSheet({
  taskId,
  taskTitle,
  lead,
  onAnswered,
  onClose,
}: {
  taskId: string;
  taskTitle: string;
  /** The sentence above the options, e.g. "Moved to tomorrow." */
  lead: string;
  /** Called once an answer has been saved. */
  onAnswered?: () => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState<FrictionReason | null>(null);
  const [result, setResult] = useState<{ message: string; askToKeep: boolean } | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(reason: FrictionReason) {
    setSending(reason);
    setError(null);
    try {
      const response = await api<{ replan: { message: string; askToKeep: boolean } }>(`/tasks/${taskId}/friction`, {
        method: "POST",
        body: { reason, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      setResult(response.replan);
      onAnswered?.();
      // A question needs an answer; anything else is just news, shown long enough to read.
      if (!response.replan.askToKeep) setTimeout(onClose, 4000);
    } catch (caught) {
      setError(describeError(caught));
      setSending(null);
    }
  }

  async function decide(choice: "KEEP" | "NEXT_WEEK" | "DROP") {
    setDeciding(true);
    setError(null);
    try {
      await api(`/tasks/${taskId}/decide`, { method: "POST", body: { choice } });
      onAnswered?.();
      onClose();
    } catch (caught) {
      setError(describeError(caught));
      setDeciding(false);
    }
  }

  if (result?.askToKeep) {
    return (
      <div className="nova-rise rounded-xl border border-neutral-200 bg-white px-4 py-4">
        <p className="font-medium text-neutral-900">Does &ldquo;{taskTitle}&rdquo; still matter?</p>
        <p className="mt-1 text-sm text-neutral-600">It&apos;s fine if it doesn&apos;t. Plans change.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={deciding} onClick={() => decide("KEEP")}>Keep it</Button>
          <Button disabled={deciding} onClick={() => decide("NEXT_WEEK")}>Move to next week</Button>
          <Button variant="ghost" disabled={deciding} onClick={() => decide("DROP")}>Drop it</Button>
        </div>
        <div className="mt-2"><ErrorNote message={error} /></div>
      </div>
    );
  }

  if (result) {
    return (
      <div role="status" className="nova-rise rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <span className="font-medium">Thanks.</span> {result.message}
      </div>
    );
  }

  return (
    <div className="nova-rise rounded-xl border border-neutral-200 bg-white px-4 py-4">
      <p className="text-sm text-neutral-600">{lead}</p>
      <p className="mt-0.5 font-medium text-neutral-900">What got in the way of &ldquo;{taskTitle}&rdquo;?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {FRICTION_OPTIONS.map((option) => (
          <button
            key={option.reason}
            type="button"
            disabled={sending !== null}
            onClick={() => answer(option.reason)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
              sending === option.reason ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-neutral-300 text-neutral-800 hover:border-indigo-400 hover:bg-indigo-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note first, if you like" aria-label="Optional note" maxLength={300} />
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" disabled={sending !== null} onClick={onClose}>Not now</Button>
      </div>
      <div className="mt-2"><ErrorNote message={error} /></div>
    </div>
  );
}

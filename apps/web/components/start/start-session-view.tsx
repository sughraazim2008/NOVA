"use client";

import { FRICTION_OPTIONS } from "@nova/behaviour";
import type { FrictionReason, StartSessionOutcome } from "@nova/types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, ErrorNote, Textarea } from "@/components/ui";
import { useProgress } from "@/components/game/progress-provider";
import { DoneBurst } from "@/components/ui/done-burst";
import { api, describeError } from "@/lib/api";
import { formatMinutes } from "@/lib/format";
import type { FinishView, StartView } from "@/server/services/start";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minutes since the session began, refreshed now and then. Shown plainly, never as a countdown. */
function useElapsedMinutes(startedAt: string | undefined) {
  const [minutes, setMinutes] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const update = () => setMinutes(Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 60_000)));
    update();
    const timer = setInterval(update, 20_000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return minutes;
}

export function StartSessionView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const game = useProgress();
  const [view, setView] = useState<StartView | null>(null);
  const [finished, setFinished] = useState<FinishView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState(false);
  const [stuckOpen, setStuckOpen] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<FrictionReason | null>(null);
  const [leaving, setLeaving] = useState(false);
  const opened = useRef(false);
  const elapsed = useElapsedMinutes(view?.session.startedAt);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    api<StartView>(`/start/${taskId}`, { method: "POST" })
      .then(setView)
      .catch((caught) => setError(describeError(caught)));
  }, [taskId]);

  async function act(action: "done" | "skip" | "stuck") {
    if (!view) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "done") setReward(true);
      const body = action === "stuck" ? { action, ...(note.trim() ? { note: note.trim() } : {}) } : { action };
      // Being stuck is friction: record why, if they said. A failure here must not hold up the new step.
      if (action === "stuck" && reason) {
        void api(`/tasks/${view.task.id}/friction`, { method: "POST", body: { reason, ...(note.trim() ? { note: note.trim() } : {}) } }).catch(() => {});
      }
      // The reward stays on screen long enough to register, however fast the server is.
      const [next] = await Promise.all([api<StartView>(`/start/sessions/${view.session.id}/step`, { method: "POST", body }), action === "done" ? wait(480) : null]);
      setView(next);
      if (action === "done") void game?.refresh();
      setStuckOpen(false);
      setNote("");
      setReason(null);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setReward(false);
      setBusy(false);
    }
  }

  async function finish(outcome: StartSessionOutcome) {
    if (!view) return;
    setBusy(true);
    setError(null);
    try {
      setFinished(await api<FinishView>(`/start/sessions/${view.session.id}/finish`, { method: "POST", body: { outcome } }));
      void game?.refresh();
      setLeaving(false);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  const backToToday = () => {
    router.push("/today");
    router.refresh();
  };

  if (finished) return <Finished result={finished} onBack={backToToday} />;

  if (!view) {
    return (
      <Shell>
        {error ? (
          <div className="flex flex-col items-center gap-4">
            <ErrorNote message={error} />
            <Button onClick={backToToday}>Back to Today</Button>
          </div>
        ) : (
          <p role="status" className="text-center text-lg text-neutral-500">Getting your first step ready…</p>
        )}
      </Shell>
    );
  }

  const { session, task } = view;
  const shown = session.steps.filter((step) => step.state !== "REPLACED");
  const position = session.steps.slice(0, session.currentStep).filter((step) => step.state !== "REPLACED").length;
  const step = session.steps[session.currentStep];
  const firstStep = position === 0;

  return (
    <Shell
      top={
        <div className="flex items-center justify-between gap-4">
          <button type="button" onClick={() => setLeaving(true)} className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100">
            Leave
          </button>
          <ol className="flex items-center gap-1.5" aria-label={`Step ${Math.min(position + 1, shown.length)} of ${shown.length}`}>
            {shown.map((item, index) => (
              <li
                key={index}
                className={`h-1.5 rounded-full transition-all ${index < position ? "w-4 bg-emerald-500" : index === position ? "w-6 bg-indigo-500" : "w-4 bg-neutral-200"}`}
              />
            ))}
          </ol>
          <span className="w-12 text-right text-xs text-neutral-400 tabular-nums">{elapsed > 0 ? `${elapsed} min` : ""}</span>
        </div>
      }
    >
      <p className="text-center text-sm text-neutral-500">{task.title}</p>

      {leaving ? (
        <div className="mt-8 flex flex-col gap-2">
          <p className="mb-2 text-center text-xl font-semibold">Leaving?</p>
          <Button variant="primary" className="py-3" disabled={busy} onClick={() => finish("COMPLETED")}>I&apos;ve finished the task</Button>
          <Button className="py-3" disabled={busy} onClick={() => finish("PARTIAL")}>Stop for now, keep what I did</Button>
          <Button variant="ghost" disabled={busy} onClick={() => finish("ABANDONED")}>I didn&apos;t really get going</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setLeaving(false)}>Stay</Button>
          <ErrorNote message={error} />
        </div>
      ) : reward ? (
        <div className="mt-12 flex justify-center">
          <DoneBurst size={firstStep ? 96 : 72} label="Step done" />
        </div>
      ) : step ? (
        <div key={session.currentStep} className="nova-rise mt-8 flex flex-col items-center">
          <p className="text-xs font-medium tracking-wide text-indigo-700 uppercase">
            Step {position + 1} · {step.estimatedMin} min
          </p>
          <h1 className="mt-3 text-center text-2xl leading-snug font-semibold text-neutral-900 sm:text-3xl">{step.instruction}</h1>

          {stuckOpen ? (
            <div className="mt-8 flex w-full flex-col gap-3">
              <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="What is in the way?">
                {FRICTION_OPTIONS.map((option) => (
                  <button
                    key={option.reason}
                    type="button"
                    aria-pressed={reason === option.reason}
                    disabled={busy}
                    onClick={() => setReason((current) => (current === option.reason ? null : option.reason))}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      reason === option.reason ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-neutral-300 text-neutral-700 hover:border-indigo-400"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Say more, if you like"
                aria-label="What's in the way?"
                maxLength={300}
                rows={2}
              />
              <Button variant="primary" className="py-3" disabled={busy} onClick={() => act("stuck")}>
                {busy ? "Finding a smaller step…" : "Give me a smaller step"}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setStuckOpen(false)}>Never mind</Button>
            </div>
          ) : (
            <>
              <Button variant="primary" className="mt-10 w-full py-4 text-lg" disabled={busy} onClick={() => act("done")}>
                {step.doneLabel}
              </Button>
              <div className="mt-3 flex gap-1">
                <Button variant="ghost" disabled={busy} onClick={() => setStuckOpen(true)}>I&apos;m stuck</Button>
                <Button variant="ghost" disabled={busy} onClick={() => act("skip")}>Skip</Button>
              </div>
            </>
          )}
          <div className="mt-4 w-full"><ErrorNote message={error} /></div>
          {!view.tailored ? <p className="mt-6 text-center text-xs text-neutral-400">General steps: the AI could not be reached to write ones for this task.</p> : null}
        </div>
      ) : (
        <div className="nova-rise mt-8 flex flex-col items-center">
          <p className="text-xs font-medium tracking-wide text-emerald-700 uppercase">You&apos;re moving</p>
          <h1 className="mt-3 text-center text-2xl leading-snug font-semibold text-neutral-900 sm:text-3xl">The hard part is behind you. Keep going with it.</h1>
          <p className="mt-3 text-center text-neutral-500">Come back here when you stop.</p>
          <Button variant="primary" className="mt-10 w-full py-4 text-lg" disabled={busy} onClick={() => finish("COMPLETED")}>I&apos;ve finished the task</Button>
          <Button variant="ghost" className="mt-3" disabled={busy} onClick={() => finish("PARTIAL")}>Stop for now</Button>
          <div className="mt-4 w-full"><ErrorNote message={error} /></div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ top, children }: { top?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="mx-auto w-full max-w-md px-5 pt-5">{top}</div>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-24">{children}</main>
    </div>
  );
}

function Finished({ result, onBack }: { result: FinishView; onBack: () => void }) {
  const { session, task, sessionMin } = result;
  const completed = session.outcome === "COMPLETED";
  const stepsDone = session.steps.filter((step) => step.state === "DONE").length;
  return (
    <Shell>
      <div className="nova-rise flex flex-col items-center text-center">
        {session.outcome === "ABANDONED" ? null : <DoneBurst size={88} label={completed ? "Task done" : "Progress saved"} />}
        <h1 className="mt-6 text-2xl font-semibold text-neutral-900">
          {completed ? "Done." : session.outcome === "PARTIAL" ? "Good place to stop." : "No problem."}
        </h1>
        <p className="mt-2 text-neutral-600">{task.title}</p>

        <dl className="mt-6 grid w-full grid-cols-2 gap-3 text-left">
          <div className="rounded-xl bg-neutral-50 px-4 py-3">
            <dt className="text-xs text-neutral-500">This sitting</dt>
            <dd className="text-lg font-medium text-neutral-900">{formatMinutes(sessionMin)}</dd>
          </div>
          <div className="rounded-xl bg-neutral-50 px-4 py-3">
            <dt className="text-xs text-neutral-500">{completed ? "Planned · took" : "Steps done"}</dt>
            <dd className="text-lg font-medium text-neutral-900">
              {completed ? `${formatMinutes(task.estimatedMin)} · ${formatMinutes(task.actualMin ?? sessionMin)}` : stepsDone}
            </dd>
          </div>
        </dl>

        {session.outcome === "ABANDONED" ? (
          <p className="mt-4 text-sm text-neutral-500">It stays in your plan. Opening it at all still counts for something.</p>
        ) : null}

        <Button variant="primary" className="mt-8 w-full py-3" onClick={onBack}>Back to Today</Button>
      </div>
    </Shell>
  );
}

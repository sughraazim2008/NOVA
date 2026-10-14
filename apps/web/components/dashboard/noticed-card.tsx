import { frictionLabel, type BehaviourSummary, type ExecutionModel } from "@nova/behaviour";
import { Card } from "@/components/ui";
import { label } from "@/lib/format";

/** Fewer than this many timed completions and a ratio says more about chance than about the person. */
const MIN_TIMED = 3;

/**
 * A plain description of the last month. Counts only: nothing here is a score, and nothing is
 * called a pattern until there is enough of it to mean something.
 */
export function NoticedCard({ summary, model }: { summary: BehaviourSummary & { days: number }; model: ExecutionModel }) {
  if (summary.started === 0 && summary.completed === 0 && summary.friction.length === 0) return null;

  const timed = summary.byCategory.reduce((sum, entry) => sum + entry.timed, 0);
  const slowest = summary.byCategory.filter((entry) => entry.timed >= MIN_TIMED && entry.meanRatio !== null).sort((a, b) => (b.meanRatio ?? 0) - (a.meanRatio ?? 0))[0];
  const topFriction = summary.friction[0];
  const lines: string[] = [];

  if (summary.started + summary.completed > 0) {
    lines.push(`${summary.completed} ${summary.completed === 1 ? "task" : "tasks"} finished and ${summary.started} started in the last ${summary.days} days.`);
  }
  if (summary.startedViaNovaStart > 0) lines.push(`${summary.startedViaNovaStart} of those starts used the guided steps.`);
  if (timed >= MIN_TIMED && summary.overallRatio !== null) {
    const ratio = summary.overallRatio;
    lines.push(
      ratio >= 1.15 ? `Tasks take you about ${ratio}× as long as estimated.` : ratio <= 0.85 ? `You finish tasks in about ${ratio}× the estimated time.` : "Your time estimates are close to what tasks really take.",
    );
  }
  if (slowest && (slowest.meanRatio ?? 0) >= 1.15) lines.push(`${label(slowest.category)} tasks run longest: about ${slowest.meanRatio}× the estimate.`);
  // What NOVA has started doing differently because of it.
  for (const entry of model.multipliers) {
    lines.push(`NOVA now plans ${label(entry.category).toLowerCase()} tasks at ${entry.multiplier}× your estimate, from ${entry.sampleSize} timed tasks.`);
  }
  if (model.preferredMaxMin !== null) lines.push(`Tasks over ${model.preferredMaxMin} minutes rarely get finished, so NOVA keeps new ones smaller.`);
  if (topFriction) {
    lines.push(
      topFriction.count >= 2
        ? `What gets in the way most: “${frictionLabel(topFriction.reason)}” (${topFriction.count} times).`
        : `You told NOVA what got in the way ${summary.friction.reduce((sum, entry) => sum + entry.count, 0) === 1 ? "once" : "a few times"}. It will use that when planning.`,
    );
  }

  return (
    <Card>
      <h2 className="text-sm font-medium text-neutral-500">What NOVA has noticed</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-neutral-800">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {timed < MIN_TIMED ? <p className="mt-2 text-xs text-neutral-500">Timing comparisons appear after a few tasks finished through Start.</p> : null}
    </Card>
  );
}

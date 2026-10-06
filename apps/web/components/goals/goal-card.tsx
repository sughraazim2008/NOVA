import Link from "next/link";
import { Badge, Card, ProgressBar } from "@/components/ui";
import { formatDate, formatMinutes, label } from "@/lib/format";
import type { GoalWithProgress } from "@/server/services/goals";

const priorityTone = { LOW: "neutral", MEDIUM: "neutral", HIGH: "amber", CRITICAL: "red" } as const;

export function GoalCard({ goal }: { goal: GoalWithProgress }) {
  const { progress } = goal;
  return (
    <Link href={`/goals/${goal.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-indigo-600">
      <Card className="transition-shadow hover:shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-medium text-neutral-900">{goal.title}</h2>
          <div className="flex shrink-0 gap-1.5">
            {goal.status !== "ACTIVE" ? <Badge>{label(goal.status)}</Badge> : null}
            <Badge tone={priorityTone[goal.priority]}>{label(goal.priority)}</Badge>
          </div>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Due {formatDate(goal.deadline)} · {formatMinutes(goal.dailyCapacityMin)} a day
        </p>
        <div className="mt-4 flex items-center gap-3">
          <ProgressBar percent={progress.percent} label={`${goal.title} progress`} />
          <span className="w-10 shrink-0 text-right text-sm tabular-nums text-neutral-600">{progress.percent}%</span>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {progress.taskCount === 0
            ? "No tasks yet"
            : `${progress.doneCount} of ${progress.taskCount} tasks · ${formatMinutes(progress.totalMin - progress.doneMin)} left`}
        </p>
      </Card>
    </Link>
  );
}

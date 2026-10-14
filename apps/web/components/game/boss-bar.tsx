import { bossState } from "@nova/behaviour";
import type { Task } from "@nova/types";
import { formatMinutes } from "@/lib/format";

/** A milestone's remaining work as a health bar that only ever goes down. */
export function BossBar({ tasks }: { tasks: Pick<Task, "estimatedMin" | "status">[] }) {
  const boss = bossState(tasks);
  if (boss.totalMin === 0) return null;
  return (
    <div className="mt-2">
      <div
        className="h-2 overflow-hidden rounded-full bg-neutral-100"
        role="progressbar"
        aria-label="Work left in this milestone"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={boss.healthPercent}
      >
        <div className={`h-full rounded-full transition-[width] duration-700 ${boss.defeated ? "bg-emerald-500" : "bg-rose-400"}`} style={{ width: `${boss.defeated ? 100 : boss.healthPercent}%` }} />
      </div>
      <p className="mt-1 text-xs text-neutral-500">{boss.defeated ? "Cleared" : `${formatMinutes(boss.remainingMin)} left of ${formatMinutes(boss.totalMin)}`}</p>
    </div>
  );
}

/** The goal as a path through its milestones, with the current position marked. */
export function JourneyMap({ milestones }: { milestones: { id: string; title: string; tasks: Pick<Task, "estimatedMin" | "status">[] }[] }) {
  if (milestones.length < 2) return null;
  const states = milestones.map((milestone) => bossState(milestone.tasks));
  const current = states.findIndex((state) => !state.defeated);
  return (
    <ol className="flex items-start" aria-label="Journey through the milestones">
      {milestones.map((milestone, index) => {
        const done = states[index]?.defeated ?? false;
        const here = index === current;
        return (
          <li key={milestone.id} className="flex min-w-0 flex-1 flex-col items-center" aria-current={here ? "step" : undefined}>
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${index === 0 ? "bg-transparent" : done || here ? "bg-emerald-400" : "bg-neutral-200"}`} />
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  done ? "bg-emerald-500 text-white" : here ? "bg-indigo-600 text-white ring-4 ring-indigo-100" : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {done ? "✓" : index + 1}
              </span>
              <span className={`h-0.5 flex-1 ${index === milestones.length - 1 ? "bg-transparent" : done ? "bg-emerald-400" : "bg-neutral-200"}`} />
            </div>
            <span className={`mt-1.5 w-full truncate px-1 text-center text-xs ${here ? "font-medium text-neutral-900" : "text-neutral-500"}`} title={milestone.title}>
              {milestone.title}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

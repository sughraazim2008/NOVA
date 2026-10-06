import Link from "next/link";
import { GoalCard } from "@/components/goals/goal-card";
import { EmptyState } from "@/components/ui";
import { pageUser } from "@/server/auth/page-user";
import { listGoals } from "@/server/services/goals";

export const metadata = { title: "Goals · NOVA" };

export default async function GoalsPage() {
  const user = await pageUser();
  const goals = await listGoals(user);
  const active = goals.filter((goal) => goal.status === "ACTIVE");
  const finished = goals.filter((goal) => goal.status !== "ACTIVE");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
        <Link href="/goals/new" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          New goal
        </Link>
      </div>
      {goals.length === 0 ? <EmptyState title="Nothing here yet">Goals you create appear on this page.</EmptyState> : null}
      <div className="flex flex-col gap-3">
        {active.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
      </div>
      {finished.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-neutral-500">Completed and archived</h2>
          {finished.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

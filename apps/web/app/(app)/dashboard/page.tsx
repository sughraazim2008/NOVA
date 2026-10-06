import Link from "next/link";
import { GoalCard } from "@/components/goals/goal-card";
import { EmptyState } from "@/components/ui";
import { pageUser } from "@/server/auth/page-user";
import { listGoals } from "@/server/services/goals";

export const metadata = { title: "Dashboard · NOVA" };

export default async function DashboardPage() {
  const user = await pageUser();
  const goals = await listGoals(user, "ACTIVE");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your goals</h1>
        <Link href="/goals/new" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          New goal
        </Link>
      </div>
      {goals.length === 0 ? (
        <EmptyState title="No active goals yet">
          <Link href="/goals/new" className="text-indigo-600 underline">
            Create your first goal
          </Link>{" "}
          and NOVA will help you turn it into days you can actually do.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  );
}

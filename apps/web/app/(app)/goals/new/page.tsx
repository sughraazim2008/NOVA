import { GoalComposer } from "@/components/goals/goal-composer";
import { pageUser } from "@/server/auth/page-user";
import { aiStatus } from "@/server/services/decomposition";

export const metadata = { title: "New goal · NOVA" };

export default async function NewGoalPage() {
  const user = await pageUser();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New goal</h1>
      <GoalComposer status={aiStatus()} defaultMinutes={user.defaultDailyCapacityMin} />
    </div>
  );
}

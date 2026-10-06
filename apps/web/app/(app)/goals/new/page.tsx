import { GoalForm } from "@/components/goals/goal-form";
import { Card } from "@/components/ui";

export const metadata = { title: "New goal · NOVA" };

export default function NewGoalPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New goal</h1>
      <Card>
        <GoalForm />
      </Card>
    </div>
  );
}

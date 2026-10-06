import { notFound } from "next/navigation";
import { GoalDetail } from "@/components/goals/goal-detail";
import { pageUser } from "@/server/auth/page-user";
import { HttpError } from "@/server/http";
import { getGoalTree } from "@/server/services/goals";

export const metadata = { title: "Goal · NOVA" };

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const tree = await getGoalTree(user, id).catch((error: unknown) => {
    if (error instanceof HttpError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  return <GoalDetail tree={tree} />;
}

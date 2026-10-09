import { TodayView } from "@/components/planner/today-view";
import { pageUser } from "@/server/auth/page-user";
import { getTodayPlan } from "@/server/services/planning";

export const metadata = { title: "Today · NOVA" };

export default async function TodayPage() {
  const user = await pageUser();
  return <TodayView plan={await getTodayPlan(user)} />;
}

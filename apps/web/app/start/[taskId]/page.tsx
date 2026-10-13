import { StartSessionView } from "@/components/start/start-session-view";
import { pageUser } from "@/server/auth/page-user";

export const metadata = { title: "Start · NOVA" };

// Deliberately outside the signed-in layout: no navigation, nothing else to look at.
export default async function StartPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  await pageUser();
  return <StartSessionView taskId={taskId} />;
}

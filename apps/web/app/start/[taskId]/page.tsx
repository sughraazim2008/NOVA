import { ProgressProvider } from "@/components/game/progress-provider";
import { StartSessionView } from "@/components/start/start-session-view";
import { pageUser } from "@/server/auth/page-user";
import { getProgress } from "@/server/services/progress";

export const metadata = { title: "Start · NOVA" };

// Deliberately outside the signed-in layout: no navigation, nothing else to look at.
export default async function StartPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const user = await pageUser();
  return (
    <ProgressProvider initial={await getProgress(user)}>
      <StartSessionView taskId={taskId} />
    </ProgressProvider>
  );
}

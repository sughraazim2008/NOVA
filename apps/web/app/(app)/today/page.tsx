import Link from "next/link";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Today · NOVA" };

export default function TodayPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
      <EmptyState title="Your daily plan will appear here">
        The planning engine is the next thing being built. Until then, set up your{" "}
        <Link href="/goals" className="text-indigo-600 underline">
          goals and tasks
        </Link>
        .
      </EmptyState>
    </div>
  );
}

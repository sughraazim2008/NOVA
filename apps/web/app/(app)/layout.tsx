import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/auth";
import { ProgressProvider } from "@/components/game/progress-provider";
import { HeaderProgress } from "@/components/game/widgets";
import { TimezoneSync } from "@/components/ui/timezone-sync";
import { pageUser } from "@/server/auth/page-user";
import { getProgress } from "@/server/services/progress";

const links = [
  { href: "/today", label: "Today" },
  { href: "/goals", label: "Goals" },
  { href: "/dashboard", label: "Dashboard" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await pageUser();
  const progress = await getProgress(user);

  return (
    <ProgressProvider initial={progress}>
    <div className="min-h-screen bg-neutral-50">
      <TimezoneSync saved={user.timezone} />
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:gap-6">
          <Link href="/today" className="text-lg font-semibold tracking-tight">
            NOVA
          </Link>
          <nav className="flex flex-1 gap-1 text-sm">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-lg px-2 py-1.5 text-neutral-700 hover:bg-neutral-100 sm:px-3">
                {link.label}
              </Link>
            ))}
          </nav>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
            className="flex items-center gap-3"
          >
            <HeaderProgress />
            <span className="hidden text-sm text-neutral-500 sm:inline">{user.name ?? user.email}</span>
            <button type="submit" className="rounded-lg px-2 py-1 text-sm whitespace-nowrap text-neutral-600 hover:bg-neutral-100">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
    </ProgressProvider>
  );
}

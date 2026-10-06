import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/auth";
import { pageUser } from "@/server/auth/page-user";

const links = [
  { href: "/today", label: "Today" },
  { href: "/goals", label: "Goals" },
  { href: "/dashboard", label: "Dashboard" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await pageUser();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:gap-6">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            NOVA
          </Link>
          <nav className="flex flex-1 gap-1 text-sm">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-lg px-3 py-1.5 text-neutral-700 hover:bg-neutral-100">
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
            <span className="hidden text-sm text-neutral-500 sm:inline">{user.name ?? user.email}</span>
            <button type="submit" className="rounded-lg px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}

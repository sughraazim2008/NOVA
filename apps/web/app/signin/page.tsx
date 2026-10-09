import { redirect } from "next/navigation";
import { devSignInEnabled, githubSignInEnabled, signIn } from "@/auth";
import { Button } from "@/components/ui";
import { getSessionUserId } from "@/server/auth/session";

export const metadata = { title: "Sign in · NOVA" };

export default async function SignInPage() {
  if (await getSessionUserId()) redirect("/today");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">NOVA</h1>
        <p className="mt-2 text-neutral-600">Turn a goal into something you can start today.</p>
      </div>

      <div className="flex flex-col gap-3">
        {githubSignInEnabled ? (
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/today" });
            }}
          >
            <Button type="submit" variant="primary" className="w-full">
              Continue with GitHub
            </Button>
          </form>
        ) : null}

        {devSignInEnabled ? (
          <form
            action={async () => {
              "use server";
              await signIn("dev", { redirectTo: "/today" });
            }}
          >
            <Button type="submit" variant={githubSignInEnabled ? "secondary" : "primary"} className="w-full">
              Continue as demo user
            </Button>
            <p className="mt-2 text-xs text-neutral-500">A shared demo account for trying NOVA. Do not put anything private in it.</p>
          </form>
        ) : null}

        {!githubSignInEnabled && !devSignInEnabled ? (
          <p className="text-sm text-neutral-600">Sign-in is not configured.</p>
        ) : null}
      </div>
    </main>
  );
}

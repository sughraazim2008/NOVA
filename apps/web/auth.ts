import { findOrCreateUserByEmail, getDb } from "@nova/database";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";

/** The seeded account that the development sign-in uses. */
export const DEMO_EMAIL = "demo@nova.local";

/**
 * One-click sign-in as the demo user. Always available in development. In a production build it
 * exists only when DEMO_SIGNIN="true" is set, which is meant for a private review deployment:
 * anyone who has the address can then use the demo account.
 */
export const devSignInEnabled = process.env.NODE_ENV !== "production" || process.env.DEMO_SIGNIN === "true";
export const githubSignInEnabled = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Sessions are signed tokens: no session tables, and a mobile client can send the same token (ADR-005).
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/signin" },
  // The deployment platform terminates TLS and forwards the real host.
  trustHost: true,
  providers: [
    ...(githubSignInEnabled ? [GitHub] : []),
    ...(devSignInEnabled
      ? [
          Credentials({
            id: "dev",
            name: "Development",
            credentials: {},
            authorize: async () => ({ email: DEMO_EMAIL, name: "Demo" }),
          }),
        ]
      : []),
  ],
  callbacks: {
    // Runs with `account` only at sign-in: that is when the NOVA user is found or created.
    async jwt({ token, user, account }) {
      if (account && user?.email) {
        const novaUser = await findOrCreateUserByEmail(getDb(), {
          email: user.email,
          ...(user.name ? { name: user.name } : {}),
        });
        token.userId = novaUser.id;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.userId === "string") session.user.id = token.userId;
      return session;
    },
  },
});

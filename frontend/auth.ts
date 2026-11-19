import { createHash, timingSafeEqual } from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

/**
 * Username + password sign-in for the workbench (F15).
 * - One demo account, set with the server-only env vars AUTH_DEMO_USERNAME / AUTH_DEMO_PASSWORD.
 * - JWT sessions in an encrypted, httpOnly cookie (AUTH_SECRET). No database, no user table.
 * - The backend API does not verify sessions; sign-in protects the UI only.
 */

const DEMO_USERNAME = process.env.AUTH_DEMO_USERNAME?.trim() ?? "";
const DEMO_PASSWORD = process.env.AUTH_DEMO_PASSWORD ?? "";

/** True when the demo account and the session secret are configured. */
export function isSignInConfigured(): boolean {
  return Boolean(DEMO_USERNAME && DEMO_PASSWORD && process.env.AUTH_SECRET);
}

/** Constant-time comparison (hashing first makes the lengths equal). */
function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: (credentials) => {
        if (!DEMO_USERNAME || !DEMO_PASSWORD) return null;
        const username = typeof credentials?.username === "string" ? credentials.username.trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        // Evaluate both so a wrong username takes as long as a wrong password.
        const userOk = sameSecret(username.toLowerCase(), DEMO_USERNAME.toLowerCase());
        const passOk = sameSecret(password, DEMO_PASSWORD);
        if (!userOk || !passOk) return null;
        return { id: DEMO_USERNAME, name: DEMO_USERNAME };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    /** Used by proxy.ts: signed-out visitors on workbench paths go to /signin. */
    authorized: ({ auth }) => Boolean(auth?.user),
    jwt: ({ token }) => ({ sub: token.sub, name: token.name, iat: token.iat, exp: token.exp, jti: token.jti }),
    session: ({ session }) => ({ ...session, user: { ...session.user, email: "", image: null } }),
  },
});

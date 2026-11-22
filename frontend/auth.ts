import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Google sign-in for the workbench (F15).
 * - OAuth credentials and AUTH_SECRET are server-only environment variables.
 * - Sessions are encrypted JWT cookies; no user table or database adapter.
 * - The backend API does not verify these sessions; sign-in protects the UI only.
 */

/** True when Google OAuth and the session secret are configured. */
export function isSignInConfigured(): boolean {
  return Boolean(
    process.env.AUTH_GOOGLE_ID?.trim() &&
      process.env.AUTH_GOOGLE_SECRET?.trim() &&
      process.env.AUTH_SECRET?.trim(),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    /** Used by proxy.ts: signed-out visitors on workbench paths go to /signin. */
    authorized: ({ auth }) => Boolean(auth?.user),
    /** Keep only the display name in the application session token. */
    jwt: ({ token }) => ({ sub: token.sub, name: token.name, iat: token.iat, exp: token.exp, jti: token.jti }),
    /** Never expose the Google email or profile image to the application. */
    session: ({ session }) => ({ ...session, user: { ...session.user, email: "", image: null } }),
  },
});

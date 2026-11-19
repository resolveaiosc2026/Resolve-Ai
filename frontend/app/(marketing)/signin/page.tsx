import type { Metadata } from "next";
import Link from "next/link";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, isSignInConfigured, signIn } from "../../../auth";

export const metadata: Metadata = {
  title: "Sign in · Resolve AI",
  description: "Sign in to open the Resolve AI retention workbench.",
};

const DEFAULT_DESTINATION = "/detect";

const ERRORS: Record<string, string> = {
  CredentialsSignin: "That username and password don't match. Try again.",
  Configuration: "Sign-in isn't set up on this server yet.",
};
const GENERIC_ERROR = "Sign-in didn't finish. Try again.";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Only same-site paths are allowed as a destination, so the page can't be used as an open redirect. */
function safeDestination(raw: string | undefined): string {
  if (!raw) return DEFAULT_DESTINATION;
  try {
    const url = new URL(raw, "http://local.invalid");
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/signin")) return DEFAULT_DESTINATION;
    return path;
  } catch {
    return DEFAULT_DESTINATION;
  }
}

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const destination = safeDestination(first(params.callbackUrl));
  const configured = isSignInConfigured();
  const errorCode = configured ? first(params.error) : "Configuration";
  const error = errorCode ? (ERRORS[errorCode] ?? GENERIC_ERROR) : null;

  const session = await auth();
  if (session?.user) redirect(destination);

  async function signInWithPassword(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        redirectTo: destination,
      });
    } catch (e) {
      // A successful sign-in throws Next's redirect, which must propagate.
      if (e instanceof AuthError) {
        const code = e.type === "CredentialsSignin" ? "CredentialsSignin" : "Default";
        redirect(`/signin?error=${code}&callbackUrl=${encodeURIComponent(destination)}`);
      }
      throw e;
    }
  }

  return (
    <main id="main" className="lp-signin">
      <div className="lp-container lp-signin-grid">
        <div className="lp-signin-copy">
          <h1>Sign in to the workbench</h1>
          <p>Use the demo account you were given. You&apos;ll land on the priority queue, with LR-20417 at the top.</p>
          <ol className="lp-signin-notes">
            <li>
              <span>01</span>
              <p>
                Decisions in this demo are recorded under the shared reviewer <b>analyst.hui</b>.
              </p>
            </li>
            <li>
              <span>02</span>
              <p>Your session lasts 30 days in this browser, or until you sign out.</p>
            </li>
            <li>
              <span>03</span>
              <p>Every case is synthetic. No real subscriber data is shown.</p>
            </li>
          </ol>
        </div>

        <div className="lp-signin-card">
          <p className="lp-signin-card-title">Sign-in</p>
          {error ? (
            <p className="lp-signin-error" role="alert">
              {error}
            </p>
          ) : null}
          <form action={signInWithPassword} className="lp-signin-form">
            <label>
              <span>Username</span>
              <input
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={!configured}
              />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" required disabled={!configured} />
            </label>
            <button type="submit" className="lp-btn" data-variant="primary" disabled={!configured}>
              Sign in
            </button>
          </form>
          <p className="lp-signin-fine">
            Opens <code>{destination}</code>. Not ready? <Link href="/#case">Follow the demo case</Link> first.
          </p>
        </div>
      </div>
    </main>
  );
}

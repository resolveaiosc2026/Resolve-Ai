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
  OAuthSignin: "Google sign-in could not be started. Check the OAuth setup and try again.",
  OAuthCallback: "Google sign-in did not finish. Try again.",
  AccessDenied: "This Google account could not be signed in.",
  Configuration: "Google sign-in isn't set up on this server yet.",
};
const GENERIC_ERROR = "Google sign-in didn't finish. Try again.";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Only same-site paths are allowed as a destination, so the page can't be used as an open redirect. */
function safeDestination(raw: string | undefined): string {
  if (!raw) return DEFAULT_DESTINATION;
  if (!raw.startsWith("/") || raw.startsWith("//")) return DEFAULT_DESTINATION;
  try {
    const url = new URL(raw, "http://local.invalid");
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (url.origin !== "http://local.invalid" || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/signin")) {
      return DEFAULT_DESTINATION;
    }
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

  async function signInWithGoogle(_formData: FormData) {
    "use server";
    try {
      await signIn("google", { redirectTo: destination });
    } catch (e) {
      // A successful sign-in throws Next's redirect, which must propagate.
      if (e instanceof AuthError) {
        const code = Object.prototype.hasOwnProperty.call(ERRORS, e.type) ? e.type : "Default";
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
          <p>Continue with your Google account. You&apos;ll land on the priority queue, with LR-20417 at the top.</p>
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
          <form action={signInWithGoogle} className="lp-signin-form">
            <button type="submit" className="lp-google-button" disabled={!configured}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.7 6.16l7.25 5.63c4.23-3.9 6.66-9.64 6.66-16.26z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.55-1.63-.86-3.38-.86-5.18s.31-3.55.86-5.18l-7.98-6.19C.92 15.17 0 19.44 0 24s.92 8.83 2.56 12.96l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.91-5.79l-7.25-5.63c-2.01 1.35-4.58 2.14-8.66 2.14-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              <span>Continue with Google</span>
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

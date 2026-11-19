/**
 * Signed-out visitors on workbench paths are redirected to /signin?callbackUrl=…
 * (see the `authorized` callback in auth.ts). The landing page, /signin and /api/auth
 * are not matched. The (workbench) layout checks the session again.
 */
export { auth as proxy } from "./auth";

export const config = {
  matcher: [
    "/detect/:path*",
    "/understand/:path*",
    "/recommend/:path*",
    "/act/:path*",
    "/measure/:path*",
    "/report/:path*",
    "/copilot/:path*",
  ],
};

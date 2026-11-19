/** Where the public pages link to. Workbench routes are behind the demo sign-in (proxy.ts). */
export const WORKBENCH_HREF = "/detect";
export const SIGN_IN_HREF = "/signin";
/** Resolve AI API base, e.g. https://…/api/v1 (docs at /docs, spec at /openapi.json). */
export const API_BASE_HREF = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

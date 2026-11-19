"use server";

import { signOut } from "../auth";

/** Ends the session (clears the cookie) and returns to the landing page. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

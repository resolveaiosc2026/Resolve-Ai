import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { AppShell } from "../../components/Shell";
import { WorkbenchProvider } from "../../components/Workbench";

export default async function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already redirects signed-out visitors with a callbackUrl; this is the second check.
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const user = { name: session.user.name ?? null, email: session.user.email ?? null };

  return (
    <WorkbenchProvider>
      <AppShell user={user}>{children}</AppShell>
    </WorkbenchProvider>
  );
}

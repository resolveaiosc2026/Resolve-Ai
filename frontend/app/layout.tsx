import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "../components/Shell";
import { WorkbenchProvider } from "../components/Workbench";

export const metadata: Metadata = {
  title: "Resolve AI — Retention Workbench",
  description:
    "Decision-intelligence workbench for Orange retention analysts. Detect, Understand, Recommend, Act, Measure, Report. Synthetic data only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WorkbenchProvider>
          <AppShell>{children}</AppShell>
        </WorkbenchProvider>
      </body>
    </html>
  );
}

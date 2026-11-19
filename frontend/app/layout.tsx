import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resolve AI — Retention Workbench",
  description:
    "Decision-intelligence workbench for Orange retention analysts. Detect, Understand, Recommend, Act, Measure, Report. Synthetic data only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { ReactNode } from "react";
import type { ReasonId } from "../lib/types";

const PATHS: Record<string, ReactNode> = {
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" />
      <path d="M3 10h18" />
      <path d="M15 14.5h2" />
    </>
  ),
  "arrow-down": (
    <>
      <path d="M12 4v14" />
      <path d="M6 13l6 6 6-6" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </>
  ),
  "signal-slash": (
    <>
      <path d="M5 19v-4" />
      <path d="M10 19v-8" />
      <path d="M15 19v-12" />
      <path d="M20 19V5" />
      <path d="M3 21L21 3" />
    </>
  ),
  "cursor-alert": (
    <>
      <path d="M5 3l13 8-6 1 3 6-3 1-3-6-4 4z" />
      <path d="M19 3v4" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.6 2.6 0 1 1 3.4 2.5c-.6.3-.9.8-.9 1.5v.5" />
      <path d="M12 17h0" />
    </>
  ),
  check: <path d="M4 12.5l5 5L20 6.5" />,
  cross: (
    <>
      <path d="M5 5l14 14" />
      <path d="M19 5L5 19" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v5" />
      <path d="M12 17.5h0" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l4 2" />
    </>
  ),
};

export const REASON_ICONS: Record<ReasonId, string> = {
  affordability: "wallet",
  reduced_need: "arrow-down",
  competitor: "swap",
  network_quality: "signal-slash",
  activation_difficulty: "cursor-alert",
  unknown: "question",
};

export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name] ?? PATHS.question}
    </svg>
  );
}

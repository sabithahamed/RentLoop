/**
 * RentLoop design tokens — calm utility.
 *
 * The ledger is meant to hold up as evidence, so the visual language is a
 * well-set bank statement rather than a consumer finance app: near-white
 * surfaces, one deep accent, desaturated status chips, and tabular figures so
 * columns of money line up.
 *
 * Restyling the app should mean editing this file and src/components/, not the
 * screens. The token names are stable — change values here freely.
 */

import type { TextStyle } from "react-native";
import type { LedgerStatus } from "./data/types";

export const color = {
  /** Very slightly warm, so white cards read as paper rather than as holes. */
  bg: "#F4F5F8",
  surface: "#FFFFFF",
  surfaceSunken: "#EFF1F5",
  surfaceRaised: "#FFFFFF",

  border: "#E3E6EC",
  borderStrong: "#CFD5DF",

  text: "#121722",
  textMuted: "#59616F",
  textFaint: "#949CAA",
  textInverse: "#FFFFFF",

  /** Deep indigo-navy. Trustworthy without being a bank's corporate blue. */
  accent: "#23408C",
  accentPressed: "#1A3070",
  accentSoft: "#E9EDF8",
  accentBorder: "#C9D4EC",

  danger: "#98211F",
  dangerSoft: "#FCEBEA",
  dangerBorder: "#F0CFCD",

  success: "#1A5C3E",
  successSoft: "#E5F2EA",

  /** The assistant's own colour, used only for agent surfaces. */
  agent: "#584B96",
  agentSoft: "#F3F1FB",
  agentBorder: "#DBD4F0",
  agentText: "#544C7D",
  agentFaint: "#7A6FB0",
} as const;

/** Chip colours per derived ledger status. Quiet on purpose — a label, not an alarm. */
export const statusColor: Record<LedgerStatus, { fg: string; bg: string }> = {
  paid: { fg: "#1A5C3E", bg: "#E5F2EA" },
  overpaid: { fg: "#0E5568", bg: "#E1EFF3" },
  partial: { fg: "#845400", bg: "#FCF0D9" },
  overdue: { fg: "#98211F", bg: "#FCEBEA" },
  due: { fg: "#23408C", bg: "#E9EDF8" },
  upcoming: { fg: "#59616F", bg: "#ECEEF2" },
};

export const statusLabel: Record<LedgerStatus, string> = {
  paid: "Paid",
  overpaid: "Overpaid",
  partial: "Partial",
  overdue: "Overdue",
  due: "Due",
  upcoming: "Upcoming",
};

/** 4pt scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

/** Money always uses tabular figures so digits align down a column. */
const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

export const type = {
  display: {
    fontSize: 32,
    fontWeight: "700",
    color: color.text,
    letterSpacing: -0.5,
    ...tabular,
  } as TextStyle,
  title: { fontSize: 21, fontWeight: "700", color: color.text, letterSpacing: -0.3 } as TextStyle,
  heading: { fontSize: 16, fontWeight: "600", color: color.text, letterSpacing: -0.1 } as TextStyle,
  body: { fontSize: 15, fontWeight: "400", color: color.text, lineHeight: 22 } as TextStyle,
  bodyMuted: {
    fontSize: 15,
    fontWeight: "400",
    color: color.textMuted,
    lineHeight: 22,
  } as TextStyle,
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: color.textFaint,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  } as TextStyle,
  caption: { fontSize: 13, fontWeight: "400", color: color.textMuted, lineHeight: 19 } as TextStyle,
  money: { fontSize: 16, fontWeight: "600", color: color.text, ...tabular } as TextStyle,
  moneyLarge: {
    fontSize: 28,
    fontWeight: "700",
    color: color.text,
    letterSpacing: -0.6,
    ...tabular,
  } as TextStyle,
  moneySmall: { fontSize: 14, fontWeight: "500", color: color.textMuted, ...tabular } as TextStyle,
} as const;

/**
 * Two elevations only. `card` is the default resting surface; `lifted` is for
 * things that sit above it — the agent panel, a result the user is meant to
 * read next. More than two and the hierarchy stops meaning anything.
 */
export const shadow = {
  card: {
    shadowColor: "#0B1220",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  lifted: {
    shadowColor: "#0B1220",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
} as const;

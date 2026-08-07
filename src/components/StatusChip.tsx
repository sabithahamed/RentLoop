import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { radius, space, statusColor, statusLabel } from "../theme";
import type { LedgerStatus } from "../data/types";

/**
 * The status of a rent period, as a quiet chip.
 *
 * Colour alone never carries the meaning — the word is always present — so the
 * ledger stays readable for colour-blind users and in a screenshot.
 */
export function StatusChip({ status, size = "md" }: { status: LedgerStatus; size?: "sm" | "md" }) {
  const { fg, bg } = statusColor[status];

  return (
    <View style={[styles.chip, size === "sm" && styles.chipSm, { backgroundColor: bg }]}>
      <View style={[styles.dot, size === "sm" && styles.dotSm, { backgroundColor: fg }]} />
      <Text style={[styles.label, size === "sm" && styles.labelSm, { color: fg }]}>
        {statusLabel[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  chipSm: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotSm: { width: 5, height: 5, borderRadius: 2.5 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  labelSm: {
    fontSize: 11,
  },
});

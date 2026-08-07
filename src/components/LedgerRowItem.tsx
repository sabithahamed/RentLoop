/**
 * One month in the ledger.
 *
 * The subtitle changes with status because the useful fact changes with
 * status: a paid month wants its date, a partial month wants what is left, an
 * overdue month wants how late it is. Showing the same field for all six would
 * be tidier and less useful.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { color, radius, space, statusColor, type } from "../theme";
import { describeDueDate, formatDate, formatLKR, formatPeriodMonth } from "../data/ledger";
import type { LedgerRow } from "../data/types";
import { StatusChip } from "./StatusChip";

function subtitleFor(row: LedgerRow): string {
  switch (row.status) {
    case "paid":
      return row.last_paid_on ? `Settled ${formatDate(row.last_paid_on)}` : "Settled";
    case "overpaid":
      return `${formatLKR(Math.abs(row.balance_cents))} over`;
    case "partial":
      return `${formatLKR(row.balance_cents)} still owed`;
    case "overdue":
    case "due":
      return describeDueDate(row.due_date);
    case "upcoming":
      return `Due ${formatDate(row.due_date)}`;
  }
}

export function LedgerRowItem({
  row,
  isCurrentMonth = false,
  onPress,
}: {
  row: LedgerRow;
  isCurrentMonth?: boolean;
  onPress: () => void;
}) {
  const accent = statusColor[row.status].fg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatPeriodMonth(row.period_month)}, ${row.status}, ${formatLKR(row.amount_due_cents)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {/* Status is carried by the chip; this bar is redundancy, not meaning. */}
      <View style={[styles.rail, { backgroundColor: accent }]} />

      <View style={styles.main}>
        <View style={styles.line}>
          <View style={styles.monthWrap}>
            <Text style={styles.month} numberOfLines={1}>
              {formatPeriodMonth(row.period_month)}
            </Text>
            {isCurrentMonth ? (
              <View style={styles.nowTag}>
                <Text style={styles.nowTagText}>NOW</Text>
              </View>
            ) : null}
          </View>
          <Text style={type.money}>{formatLKR(row.amount_due_cents)}</Text>
        </View>

        <View style={[styles.line, styles.lineBottom]}>
          <View style={styles.subtitleWrap}>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitleFor(row)}
            </Text>
            {row.unproven_payment_count > 0 ? (
              <View style={styles.noProof}>
                <View style={styles.noProofDot} />
                <Text style={styles.noProofText}>No slip</Text>
              </View>
            ) : null}
          </View>
          <StatusChip status={row.status} size="sm" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    overflow: "hidden",
  },
  rowPressed: { backgroundColor: color.surfaceSunken },
  rail: { width: 3 },
  main: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  lineBottom: { marginTop: 2 },
  monthWrap: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  month: { ...type.heading, flexShrink: 1 },
  nowTag: {
    backgroundColor: color.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nowTagText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: color.textInverse,
  },
  subtitleWrap: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  subtitle: { ...type.caption, flexShrink: 1 },
  noProof: { flexDirection: "row", alignItems: "center", gap: 4 },
  noProofDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.textFaint,
  },
  noProofText: { fontSize: 12, color: color.textFaint },
});

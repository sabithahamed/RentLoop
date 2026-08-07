import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { Pill } from "@/components/lifecycle";
import { Button, ErrorState, LoadingState } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate, formatLKR } from "@/data/ledger";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/data/types";
import type { Receipt } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

/**
 * A digital receipt.
 *
 * The distinction that matters: a bank slip proves money left the tenant's
 * account, a receipt proves the landlord agrees it arrived and what it was
 * for. Only the landlord can issue one, which is why the button is theirs and
 * the tenant sees "not issued yet" rather than a way to fake it.
 */
export default function ReceiptScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { repo, role, invalidate } = useApp();

  const {
    data: receipt,
    loading,
    error,
  } = useAsync<Receipt>(() => repo.getReceipt(paymentId), [paymentId]);

  const [busy, setBusy] = useState(false);

  const issue = async () => {
    setBusy(true);
    try {
      await repo.issueReceipt(paymentId);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  if (loading && !receipt) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!receipt) return null;

  const issued = receipt.issuedOn !== null;

  return (
    <>
      <Stack.Screen options={{ title: "Receipt" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <View style={[styles.paper, !issued && styles.paperDraft]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>RENTLOOP</Text>
              <Text style={styles.docType}>RENT RECEIPT</Text>
            </View>
            <Pill label={issued ? "Issued" : "Not issued"} tone={issued ? "good" : "warn"} />
          </View>

          <Text style={styles.reference}>{receipt.reference}</Text>

          <View style={styles.amountBlock}>
            <Text style={type.label}>Amount received</Text>
            <Text style={styles.amount}>
              {formatLKR(receipt.amountCents, { showDecimals: true })}
            </Text>
          </View>

          <Row label="For" value={`${receipt.periodLabel} rent`} />
          <Row label="Property" value={receipt.propertyLabel} />
          <Row label="Paid by" value={receipt.tenantName} />
          <Row label="Received by" value={receipt.landlordName} />
          <Row label="Date paid" value={formatDate(receipt.paidOn)} />
          <Row
            label="Method"
            value={PAYMENT_METHOD_LABELS[receipt.method as PaymentMethod] ?? receipt.method}
            last
          />

          {issued ? (
            <View style={styles.issuedBlock}>
              <Text style={styles.issuedText}>
                Confirmed received by {receipt.issuedBy} on {formatDate(receipt.issuedOn!)}.
              </Text>
            </View>
          ) : (
            <View style={styles.draftBlock}>
              <Text style={styles.draftText}>
                Your landlord has not confirmed this one yet. The payment and its slip are still
                recorded — this only adds their acknowledgement.
              </Text>
            </View>
          )}
        </View>

        {role === "landlord" && !issued ? (
          <Button
            label="Confirm I received this"
            onPress={issue}
            loading={busy}
            style={styles.action}
          />
        ) : null}

        <Text style={styles.footnote}>
          Sharing and PDF export are not built. On a real receipt this is where you would send it to
          yourself, or to whoever is asking for proof of rent.
        </Text>
      </ScrollView>
    </>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },

  paper: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    padding: space.xl,
  },
  paperDraft: { borderStyle: "dashed" },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
  },
  brand: { fontSize: 15, fontWeight: "700", letterSpacing: 2, color: color.accent },
  docType: { ...type.label, marginTop: 2 },
  reference: {
    fontSize: 12,
    color: color.textFaint,
    marginTop: space.md,
    fontVariant: ["tabular-nums"],
  },

  amountBlock: {
    marginTop: space.lg,
    marginBottom: space.lg,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  amount: { ...type.moneyLarge, fontSize: 30, marginTop: space.xs },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.lg,
    paddingVertical: space.sm,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  rowLabel: { fontSize: 13.5, color: color.textMuted },
  rowValue: { flex: 1, fontSize: 13.5, color: color.text, fontWeight: "500", textAlign: "right" },

  issuedBlock: {
    marginTop: space.lg,
    backgroundColor: "#E6F2EB",
    borderRadius: radius.sm,
    padding: space.md,
  },
  issuedText: { fontSize: 13, color: "#1B5E3F", lineHeight: 19 },
  draftBlock: {
    marginTop: space.lg,
    backgroundColor: color.surfaceSunken,
    borderRadius: radius.sm,
    padding: space.md,
  },
  draftText: { fontSize: 13, color: color.textMuted, lineHeight: 19 },

  action: { marginTop: space.xl },
  footnote: {
    ...type.caption,
    fontSize: 12,
    marginTop: space.xl,
    lineHeight: 18,
    fontStyle: "italic",
  },
});

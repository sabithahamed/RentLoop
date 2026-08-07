/**
 * Renders a payment's proof.
 *
 * A slip picked in-app is a real file URI and renders as an actual image. The
 * seeded demo payments carry a `mock://` URI instead and are drawn as a
 * facsimile deposit slip — no bundled assets, and it reads more honestly at
 * design-review time than a blurred stock photo would.
 */

import React from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { color, radius, space, type } from "../theme";
import { MOCK_SLIP_URI } from "../data/mock/seed";
import { formatDate, formatLKR } from "../data/ledger";
import type { Cents, ISODate } from "../data/types";

export const isMockSlip = (uri: string | null): boolean => !!uri && uri.startsWith(MOCK_SLIP_URI);

export function SlipImage({
  uri,
  amountCents,
  paidOn,
  reference,
  variant = "full",
  style,
}: {
  uri: string;
  amountCents: Cents;
  paidOn: ISODate;
  reference: string | null;
  variant?: "thumb" | "full";
  style?: StyleProp<ViewStyle>;
}) {
  if (!isMockSlip(uri)) {
    return (
      <View style={[variant === "thumb" ? styles.thumb : styles.full, style]}>
        <Image source={{ uri }} resizeMode="cover" style={styles.imageFill} />
      </View>
    );
  }

  const thumb = variant === "thumb";

  return (
    <View style={[thumb ? styles.thumb : styles.full, styles.paper, style]}>
      <View style={styles.paperHeader}>
        <Text style={[styles.bankName, thumb && styles.bankNameThumb]}>SAMPATH BANK PLC</Text>
        {!thumb && <Text style={styles.branch}>NUGEGODA BRANCH</Text>}
      </View>

      <Text style={[styles.docType, thumb && styles.docTypeThumb]}>CREDIT ADVICE</Text>

      <View style={styles.paperBody}>
        {!thumb && <SlipLine label="Beneficiary" value="W. A. D. PERERA" />}
        <SlipLine label="Account" value="0072 •••• 4418" small={thumb} />
        <SlipLine label="Date" value={formatDate(paidOn)} small={thumb} />
        {!thumb && reference ? <SlipLine label="Reference" value={reference} /> : null}
      </View>

      <View style={[styles.amountBox, thumb && styles.amountBoxThumb]}>
        <Text style={[styles.amountLabel, thumb && { fontSize: 8 }]}>AMOUNT</Text>
        <Text style={[styles.amount, thumb && styles.amountThumb]}>
          {formatLKR(amountCents, { showDecimals: true })}
        </Text>
      </View>

      {!thumb && (
        <View style={styles.stamp}>
          <Text style={styles.stampText}>TRANSACTION{"\n"}SUCCESSFUL</Text>
        </View>
      )}
    </View>
  );
}

function SlipLine({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <View style={styles.slipLine}>
      <Text style={[styles.slipLabel, small && { fontSize: 8 }]}>{label}</Text>
      <Text style={[styles.slipValue, small && { fontSize: 9 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: 64,
    height: 84,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  full: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: color.surfaceSunken,
  },
  imageFill: { width: "100%", height: "100%" },

  paper: {
    backgroundColor: "#FCFBF7",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    padding: space.md,
  },
  paperHeader: {
    borderBottomWidth: 1,
    borderBottomColor: "#2E4A7D",
    paddingBottom: space.xs,
  },
  bankName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2E4A7D",
    letterSpacing: 0.5,
  },
  bankNameThumb: { fontSize: 7, letterSpacing: 0 },
  branch: { fontSize: 9, color: color.textMuted, letterSpacing: 1, marginTop: 2 },

  docType: {
    ...type.label,
    fontSize: 10,
    color: color.textMuted,
    marginTop: space.md,
  },
  docTypeThumb: { fontSize: 6, marginTop: space.xs },

  paperBody: { marginTop: space.sm, gap: space.xs },
  slipLine: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  slipLabel: { fontSize: 11, color: color.textFaint },
  slipValue: { fontSize: 11, color: color.text, fontWeight: "500", fontVariant: ["tabular-nums"] },

  amountBox: {
    marginTop: "auto",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderStrong,
    paddingTop: space.sm,
  },
  amountBoxThumb: { paddingTop: space.xs },
  amountLabel: { fontSize: 9, letterSpacing: 1, color: color.textFaint, fontWeight: "600" },
  amount: { fontSize: 20, fontWeight: "700", color: color.text, fontVariant: ["tabular-nums"] },
  amountThumb: { fontSize: 9 },

  stamp: {
    position: "absolute",
    right: space.lg,
    bottom: space.xxxl,
    transform: [{ rotate: "-14deg" }],
    borderWidth: 2,
    borderColor: "rgba(27, 94, 63, 0.55)",
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  stampText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
    color: "rgba(27, 94, 63, 0.65)",
  },
});

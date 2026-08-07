import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { StoredSlip } from "@/components/SlipImage";
import {
  Button,
  Card,
  Divider,
  ErrorState,
  KeyValue,
  LoadingState,
  SectionLabel,
} from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate, formatLKR } from "@/data/ledger";
import { PAYMENT_METHOD_LABELS, type Payment } from "@/data/types";
import { color, radius, space, type } from "@/theme";

export default function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, invalidate } = useApp();

  const { data, loading, error } = useAsync<Payment>(() => repo.getPayment(id), [id]);
  const [busy, setBusy] = useState(false);

  const addSlip = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "RentLoop needs access to your photos to attach a slip.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setBusy(true);
    try {
      await repo.attachSlip(id, result.assets[0].uri);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Card>
        <Text style={type.label}>Amount paid</Text>
        <Text style={styles.amount}>{formatLKR(data.amount_cents, { showDecimals: true })}</Text>

        <Divider />

        <KeyValue label="Date paid" value={formatDate(data.paid_on)} />
        <Divider />
        <KeyValue label="Method" value={PAYMENT_METHOD_LABELS[data.method]} />
        {data.reference ? (
          <>
            <Divider />
            <KeyValue
              label="Reference"
              value={data.reference}
              valueStyle={{ fontVariant: ["tabular-nums"] }}
            />
          </>
        ) : null}
        {data.note ? (
          <>
            <Divider />
            <KeyValue label="Note" value={data.note} />
          </>
        ) : null}
      </Card>

      <Button
        label="View receipt"
        variant="secondary"
        onPress={() => router.push(`/receipt/${data.id}`)}
        style={styles.receiptButton}
      />

      <SectionLabel>Bank slip</SectionLabel>

      {data.receipt_path ? (
        <StoredSlip
          receiptPath={data.receipt_path}
          amountCents={data.amount_cents}
          paidOn={data.paid_on}
          reference={data.reference}
          variant="full"
        />
      ) : (
        <Card>
          <Text style={[type.bodyMuted, styles.missing]}>
            No slip attached to this payment. If it was a bank transfer, adding the slip now means
            you still have the proof when it matters.
          </Text>
          <Button
            label="Add a slip"
            variant="secondary"
            onPress={addSlip}
            loading={busy}
            style={styles.addButton}
          />
        </Card>
      )}

      {data.receipt_path ? (
        <View style={styles.privacy}>
          <Text style={styles.privacyText}>Stored privately. Only you can open this image.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  amount: { ...type.moneyLarge, marginTop: space.xs, marginBottom: space.lg },
  receiptButton: { marginTop: space.lg },
  missing: { fontSize: 14, lineHeight: 21 },
  addButton: { marginTop: space.lg },
  privacy: {
    marginTop: space.lg,
    padding: space.md,
    backgroundColor: color.surfaceSunken,
    borderRadius: radius.sm,
  },
  privacyText: { ...type.caption, fontSize: 12, textAlign: "center" },
});

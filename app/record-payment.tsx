import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { SlipImage } from "@/components/SlipImage";
import {
  Button,
  ErrorState,
  Field,
  LoadingState,
  SectionLabel,
  SegmentedControl,
} from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatLKR, formatPeriodMonth, parseLKRInput, todayISO } from "@/data/ledger";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type PeriodDetail,
} from "@/data/types";
import { color, radius, space, type } from "@/theme";

export default function RecordPaymentScreen() {
  const { periodId } = useLocalSearchParams<{ periodId: string }>();
  const { repo, invalidate } = useApp();

  const { data, loading, error } = useAsync<PeriodDetail>(
    () => repo.getPeriodDetail(periodId),
    [periodId],
  );

  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Prefill with what is actually outstanding — but leave it editable, which is
  // what makes a partial payment a first-class thing rather than an error.
  useEffect(() => {
    if (!data || amount !== "") return;
    const outstanding = Math.max(data.period.balance_cents, 0);
    const prefill = outstanding > 0 ? outstanding : data.period.amount_due_cents;
    setAmount(String(prefill / 100));
  }, [data]);

  const pickSlip = async () => {
    const choose = async (fromCamera: boolean) => {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setFormError("RentLoop needs permission to add a photo of the slip.");
        return;
      }

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.7,
          });

      if (!result.canceled && result.assets[0]) {
        setReceiptUri(result.assets[0].uri);
        setFormError(null);
      }
    };

    Alert.alert("Add the bank slip", "Where is the photo?", [
      { text: "Take a photo", onPress: () => void choose(true) },
      { text: "Choose from library", onPress: () => void choose(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const submit = async () => {
    const cents = parseLKRInput(amount);
    if (cents === null || cents <= 0) {
      setFormError("Enter the amount you paid");
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      await repo.recordPayment({
        rentPeriodId: periodId,
        amountCents: cents,
        paidOn,
        method,
        reference: reference || null,
        note: note || null,
        receiptUri,
      });
      invalidate();
      router.back();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save the payment");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { period } = data;
  const enteredCents = parseLKRInput(amount) ?? 0;
  const remainingAfter = period.balance_cents - enteredCents;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={60}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.context}>
          <Text style={type.label}>Paying for</Text>
          <Text style={type.title}>{formatPeriodMonth(period.period_month)}</Text>
          <Text style={[type.caption, styles.contextSub]}>
            {period.balance_cents > 0
              ? `${formatLKR(period.balance_cents)} outstanding of ${formatLKR(period.amount_due_cents)}`
              : `Already settled — ${formatLKR(period.paid_cents)} recorded`}
          </Text>
        </View>

        <Field
          label="Amount paid"
          required
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0"
        />

        {enteredCents > 0 && remainingAfter > 0 ? (
          <View style={styles.partialNote}>
            <Text style={styles.partialText}>
              Part payment — {formatLKR(remainingAfter)} will still be owed for this month.
            </Text>
          </View>
        ) : null}

        <Field
          label="Date paid"
          required
          value={paidOn}
          onChangeText={setPaidOn}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          style={styles.spaced}
        />

        <SegmentedControl<PaymentMethod>
          label="How did you pay?"
          value={method}
          onChange={setMethod}
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
        />

        <Field
          label="Bank reference"
          value={reference}
          onChangeText={setReference}
          placeholder="CT 8842190"
          autoCapitalize="characters"
        />

        <Field
          label="Note"
          value={note}
          onChangeText={setNote}
          placeholder="Anything worth remembering later"
          multiline
        />

        <SectionLabel>Proof</SectionLabel>
        {receiptUri ? (
          <View style={styles.slipPreview}>
            <SlipImage
              uri={receiptUri}
              amountCents={enteredCents}
              paidOn={paidOn}
              reference={reference || null}
              variant="thumb"
            />
            <View style={styles.slipPreviewBody}>
              <Text style={type.body}>Slip attached</Text>
              <Pressable accessibilityRole="button" onPress={() => setReceiptUri(null)} hitSlop={8}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={pickSlip}
            style={({ pressed }) => [styles.attach, pressed && styles.attachPressed]}
          >
            <Text style={styles.attachTitle}>Attach the bank slip</Text>
            <Text style={styles.attachSub}>
              Optional — but it is what settles an argument six months from now.
            </Text>
          </Pressable>
        )}

        {formError ? <Text style={styles.formError}>{formError}</Text> : null}

        <Button label="Save payment" onPress={submit} loading={busy} style={styles.submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },

  context: { marginBottom: space.xl },
  contextSub: { marginTop: space.xs },

  spaced: { marginTop: space.xs },

  partialNote: {
    backgroundColor: "#FCF1DC",
    borderRadius: radius.sm,
    padding: space.md,
    marginTop: -space.sm,
    marginBottom: space.lg,
  },
  partialText: { fontSize: 13, color: "#8A5A00", lineHeight: 18 },

  attach: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.borderStrong,
    borderRadius: radius.md,
    padding: space.lg,
    alignItems: "center",
    backgroundColor: color.surface,
  },
  attachPressed: { backgroundColor: color.surfaceSunken },
  attachTitle: { fontSize: 15, fontWeight: "600", color: color.accent },
  attachSub: {
    ...type.caption,
    fontSize: 12.5,
    marginTop: space.xs,
    textAlign: "center",
  },

  slipPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.md,
  },
  slipPreviewBody: { flex: 1, gap: space.xs },
  remove: { fontSize: 13, fontWeight: "600", color: color.danger },

  formError: { ...type.caption, color: color.danger, marginTop: space.md },
  submit: { marginTop: space.xxl },
});

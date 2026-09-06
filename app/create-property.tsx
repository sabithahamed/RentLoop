import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { Button, Card, Field, SectionLabel } from "@/components/ui";
import { useApp } from "@/data/store";
import { formatLKR, ordinal, parseLKRInput } from "@/data/ledger";
import { color, space, type } from "@/theme";

/**
 * A landlord adding a property they already let.
 *
 * Deliberately not the tenant's create-tenancy form with the labels swapped.
 * That one asks who your landlord is; this one does not, because the answer is
 * the person filling it in. What it asks instead is the rent and the due day,
 * which is what turns the property into a ledger the tenant can pay against
 * the moment they are approved onto it.
 */
export default function CreatePropertyScreen() {
  const { repo, invalidate, setRole } = useApp();

  const [label, setLabel] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [rent, setRent] = useState("");
  const [dueDay, setDueDay] = useState("5");
  const [startedOn, setStartedOn] = useState(new Date().toISOString().slice(0, 10));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const rentCents = parseLKRInput(rent);
  const dueDayNumber = Number(dueDay);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!label.trim()) next.label = "Give the property a name you will recognise";
    if (!city.trim()) next.city = "Which town or suburb?";
    if (rentCents === null || rentCents <= 0) next.rent = "Enter the monthly rent";
    if (!Number.isInteger(dueDayNumber) || dueDayNumber < 1 || dueDayNumber > 31) {
      next.dueDay = "A day between 1 and 31";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startedOn)) next.startedOn = "Use YYYY-MM-DD";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const summary = await repo.createLandlordTenancy({
        propertyLabel: label,
        addressLine,
        city,
        rentAmountCents: rentCents as number,
        dueDayOfMonth: dueDayNumber,
        startedOn,
      });
      setRole("landlord");
      invalidate();
      // Straight to the code, because a property with no tenant on it is only
      // half the job and the next thing they need is the invite.
      router.replace(`/invite-tenant?tenancyId=${summary.tenancy.id}`);
    } catch (e) {
      setErrors({ form: e instanceof Error ? e.message : "Could not save the property" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Add a property" }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionLabel>The property</SectionLabel>
          <Field
            label="Name it"
            required
            value={label}
            onChangeText={setLabel}
            placeholder="Nugegoda annex"
            hint="However you refer to it. Your tenant sees this too."
            error={errors.label}
          />
          <Field
            label="Street or lane"
            value={addressLine}
            onChangeText={setAddressLine}
            placeholder="Off Sarana Road"
          />
          <Field
            label="Town or suburb"
            required
            value={city}
            onChangeText={setCity}
            placeholder="Nugegoda"
            error={errors.city}
          />

          <SectionLabel>The rent</SectionLabel>
          <Field
            label="Monthly rent"
            required
            value={rent}
            onChangeText={setRent}
            keyboardType="decimal-pad"
            placeholder="45000"
            hint={rentCents ? `${formatLKR(rentCents)} a month` : "In rupees"}
            error={errors.rent}
          />
          <View style={styles.pair}>
            <Field
              label="Due on the"
              required
              value={dueDay}
              onChangeText={setDueDay}
              keyboardType="number-pad"
              maxLength={2}
              hint={
                dueDayNumber >= 1 && dueDayNumber <= 31
                  ? `${ordinal(dueDayNumber)} of each month`
                  : undefined
              }
              error={errors.dueDay}
              style={styles.half}
            />
            <Field
              label="Tenancy started"
              required
              value={startedOn}
              onChangeText={setStartedOn}
              placeholder="2026-01-01"
              autoCapitalize="none"
              error={errors.startedOn}
              style={styles.half}
            />
          </View>

          <Card style={styles.note}>
            <Text style={type.heading}>Your tenant is not on it yet</Text>
            <Text style={styles.body}>
              Saving this gives you a code to hand them. They ask to join with it and you approve —
              until then the property is yours alone, and a month due on the{" "}
              {dueDayNumber >= 1 && dueDayNumber <= 31 ? ordinal(dueDayNumber) : "chosen day"} is
              already being tracked.
            </Text>
          </Card>

          {errors.form ? <Text style={styles.error}>{errors.form}</Text> : null}

          <Button label="Save and get the code" onPress={submit} loading={busy} />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  pair: { flexDirection: "row", gap: space.md },
  half: { flex: 1 },
  note: { marginTop: space.lg, marginBottom: space.xl },
  body: { ...type.caption, fontSize: 13, lineHeight: 20, marginTop: space.sm },
  error: { ...type.caption, color: color.danger, marginBottom: space.md },
});

import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Field, SectionLabel } from '@/components/ui';
import { useApp } from '@/data/store';
import {
  addMonths,
  daysInMonth,
  firstOfMonth,
  formatDate,
  formatLKR,
  ordinal,
  parseISODate,
  parseLKRInput,
  todayISO,
} from '@/data/ledger';
import { color, space, type } from '@/theme';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const { year, month, day } = parseISODate(value);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/**
 * One screen, one submit — creates the property, the landlord contact, and the
 * tenancy together, then generates the ledger. Three tables, but the tenant is
 * answering one question: "what are you renting, from whom, for how much?"
 */
export default function CreateTenancyScreen() {
  const { repo, refreshTenancy, invalidate } = useApp();

  const [propertyLabel, setPropertyLabel] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [rent, setRent] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [startedOn, setStartedOn] = useState(firstOfMonth(todayISO()));

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rentCents = parseLKRInput(rent);
  const dueDayNumber = Number(dueDay);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!propertyLabel.trim()) next.propertyLabel = 'Give the place a name you will recognise';
    if (!landlordName.trim()) next.landlordName = "Enter your landlord's name";
    if (rentCents === null || rentCents <= 0) next.rent = 'Enter the monthly rent';
    if (!Number.isInteger(dueDayNumber) || dueDayNumber < 1 || dueDayNumber > 31) {
      next.dueDay = 'A day between 1 and 31';
    }
    if (!isRealDate(startedOn)) next.startedOn = 'Use YYYY-MM-DD';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      await repo.createTenancy({
        propertyLabel,
        addressLine,
        city,
        landlordName,
        landlordPhone,
        rentAmountCents: rentCents!,
        dueDayOfMonth: dueDayNumber,
        startedOn,
      });
      await refreshTenancy();
      invalidate();
      router.replace('/tenant/home');
    } catch (e) {
      setErrors({ form: e instanceof Error ? e.message : 'Could not save your tenancy' });
    } finally {
      setBusy(false);
    }
  };

  const previewValid = rentCents !== null && rentCents > 0 && dueDayNumber >= 1 && dueDayNumber <= 31;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[type.bodyMuted, styles.intro]}>
          This becomes your rent ledger. You can record payments against every month from your
          start date onward.
        </Text>

        <SectionLabel style={styles.firstLabel}>The property</SectionLabel>
        <Field
          label="What do you call it?"
          required
          value={propertyLabel}
          onChangeText={setPropertyLabel}
          placeholder="Annex, Nugegoda"
          hint="Just for you — a name you will recognise in a list."
          error={errors.propertyLabel}
        />
        <Field
          label="Address"
          value={addressLine}
          onChangeText={setAddressLine}
          placeholder="14/3 Sarana Road"
        />
        <Field label="City" value={city} onChangeText={setCity} placeholder="Nugegoda" />

        <SectionLabel>Your landlord</SectionLabel>
        <Field
          label="Name"
          required
          value={landlordName}
          onChangeText={setLandlordName}
          placeholder="Mr. Perera"
          hint="Your landlord does not need the app. You can invite them later."
          error={errors.landlordName}
        />
        <Field
          label="Phone"
          value={landlordPhone}
          onChangeText={setLandlordPhone}
          keyboardType="phone-pad"
          placeholder="077 412 8890"
        />

        <SectionLabel>The rent</SectionLabel>
        <Field
          label="Monthly rent"
          required
          value={rent}
          onChangeText={setRent}
          keyboardType="numeric"
          placeholder="45000"
          error={errors.rent}
        />
        <Field
          label="Due day of the month"
          required
          value={dueDay}
          onChangeText={setDueDay}
          keyboardType="number-pad"
          maxLength={2}
          hint="If you pick 31, short months fall due on their last day."
          error={errors.dueDay}
        />
        <Field
          label="Tenancy started"
          required
          value={startedOn}
          onChangeText={setStartedOn}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          hint="Your ledger starts from this month."
          error={errors.startedOn}
        />

        {previewValid && isRealDate(startedOn) ? (
          <View style={styles.preview}>
            <Text style={styles.previewText}>
              {formatLKR(rentCents!)} due on the {ordinal(dueDayNumber)}, from{' '}
              {formatDate(firstOfMonth(startedOn))} through{' '}
              {formatDate(addMonths(firstOfMonth(todayISO()), 3))}.
            </Text>
          </View>
        ) : null}

        {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

        <Button label="Create my ledger" onPress={submit} loading={busy} style={styles.submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xxl, paddingBottom: space.xxxl * 2 },
  intro: { fontSize: 14 },
  firstLabel: { marginTop: space.xxl },
  preview: {
    backgroundColor: color.accentSoft,
    borderRadius: 12,
    padding: space.lg,
    marginTop: space.sm,
  },
  previewText: { fontSize: 14, color: color.accent, lineHeight: 20 },
  formError: { ...type.caption, color: color.danger, marginTop: space.md },
  submit: { marginTop: space.xxl },
});

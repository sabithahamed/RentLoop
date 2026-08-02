import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { EmptyNote, Pill } from '@/components/lifecycle';
import { Button, Card, ErrorState, Field, LoadingState, SectionLabel } from '@/components/ui';
import { useApp, useAsync } from '@/data/store';
import { formatDate, formatLKR, parseLKRInput } from '@/data/ledger';
import { settlementTotals } from '@/data/mock/lifecycleSeed';
import type { DepositSettlement } from '@/data/lifecycleTypes';
import type { TenancySummary } from '@/data/types';
import { color, radius, space, type } from '@/theme';

/**
 * Deposit settlement — the end of the loop, and the reason the move-in photos
 * were worth taking.
 *
 * Deductions are proposed by the landlord and answered one at a time by the
 * tenant. Each one shows which inspection areas back it up; a deduction with
 * no evidence behind it is shown as exactly that, because that is the argument
 * the tenant needs to be able to make.
 */
export default function DepositScreen() {
  const { tenancyId } = useLocalSearchParams<{ tenancyId?: string }>();
  const { repo, role, invalidate } = useApp();

  const { data: tenancies, loading: loadingTenancies } = useAsync<TenancySummary[]>(
    () => repo.listTenancies(),
    [],
  );
  const ended = tenancies?.find((t) => t.tenancy.status === 'ended') ?? null;
  const targetId = tenancyId ?? ended?.tenancy.id ?? null;

  const { data: settlement, loading: loadingSettlement, error } = useAsync<DepositSettlement | null>(
    async () => (targetId ? repo.getSettlement(targetId) : null),
    [targetId],
  );

  // Same two-wave load as the reviews screen: without this, the gap renders
  // "nothing to settle", which is a claim rather than a loading state.
  const loading =
    loadingTenancies || loadingSettlement || (targetId !== null && settlement === null);

  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const respond = async (deductionId: string, agreed: boolean) => {
    setBusy(true);
    try {
      await repo.respondToDeduction(deductionId, agreed);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const propose = async () => {
    if (!settlement) return;
    const cents = parseLKRInput(amount);
    if (!label.trim()) return setFormError('What is the deduction for?');
    if (cents === null || cents <= 0) return setFormError('Enter an amount');
    if (!reason.trim()) return setFormError('Say why — an unexplained deduction gets disputed');

    setBusy(true);
    setFormError(null);
    try {
      await repo.proposeDeduction(
        settlement.id,
        { label: label.trim(), amountCents: cents, reason: reason.trim(), evidenceAreaNames: [] },
        'landlord',
      );
      setLabel('');
      setAmount('');
      setReason('');
      setAdding(false);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const settle = async () => {
    if (!settlement) return;
    setBusy(true);
    try {
      await repo.settleDeposit(settlement.id);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  if (!settlement || settlement.depositCents === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Deposit' }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <Card>
            <EmptyNote>
              Nothing to settle. A deposit settlement opens when a tenancy ends and the move-out
              inspection is done.
            </EmptyNote>
          </Card>
        </ScrollView>
      </>
    );
  }

  const totals = settlementTotals(settlement);
  const unanswered = settlement.deductions.filter((d) => d.agreed === null).length;

  return (
    <>
      <Stack.Screen options={{ title: 'Deposit settlement' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {ended ? <Text style={type.caption}>{ended.property.label}</Text> : null}

        <Card style={styles.summary}>
          <Text style={type.label}>You should get back</Text>
          <Text style={styles.big}>{formatLKR(totals.returning)}</Text>

          <View style={styles.mathRow}>
            <Text style={type.bodyMuted}>Deposit paid</Text>
            <Text style={styles.mathValue}>{formatLKR(settlement.depositCents)}</Text>
          </View>
          <View style={styles.mathRow}>
            <Text style={type.bodyMuted}>Deductions you agreed</Text>
            <Text style={[styles.mathValue, { color: color.danger }]}>
              −{formatLKR(totals.agreed)}
            </Text>
          </View>
          {totals.proposed !== totals.agreed ? (
            <View style={styles.mathRow}>
              <Text style={type.bodyMuted}>Still being argued</Text>
              <Text style={styles.mathValue}>{formatLKR(totals.proposed - totals.agreed)}</Text>
            </View>
          ) : null}

          <View style={styles.statusRow}>
            <Pill
              label={STATUS_LABEL[settlement.status]}
              tone={settlement.status === 'settled' ? 'good' : settlement.status === 'disputed' ? 'bad' : 'warn'}
            />
            {unanswered > 0 ? <Pill label={`${unanswered} to answer`} tone="warn" /> : null}
          </View>
        </Card>

        <Button
          label="See move-in vs move-out"
          variant="secondary"
          onPress={() => router.push(`/inspection/compare?tenancyId=${settlement.tenancy_id}`)}
          style={styles.compare}
        />

        <SectionLabel>Proposed deductions</SectionLabel>
        <View style={styles.list}>
          {settlement.deductions.map((deduction) => (
            <View key={deduction.id} style={styles.deduction}>
              <View style={styles.deductionTop}>
                <Text style={styles.deductionLabel}>{deduction.label}</Text>
                <Text style={styles.deductionAmount}>{formatLKR(deduction.amountCents)}</Text>
              </View>

              <Text style={styles.reason}>{deduction.reason}</Text>

              {deduction.evidenceAreaNames.length > 0 ? (
                <View style={styles.evidence}>
                  <Text style={styles.evidenceLabel}>Backed by</Text>
                  <Text style={styles.evidenceValue}>
                    {deduction.evidenceAreaNames.join(', ')} — photographed at both ends
                  </Text>
                </View>
              ) : (
                <View style={[styles.evidence, styles.evidenceNone]}>
                  <Text style={styles.evidenceNoneText}>
                    No inspection evidence attached to this one.
                  </Text>
                </View>
              )}

              {deduction.agreed === null ? (
                role === 'tenant' ? (
                  <View style={styles.respond}>
                    <Button
                      label="I agree"
                      variant="secondary"
                      onPress={() => respond(deduction.id, true)}
                      disabled={busy}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="I dispute this"
                      variant="danger"
                      onPress={() => respond(deduction.id, false)}
                      disabled={busy}
                      style={{ flex: 1 }}
                    />
                  </View>
                ) : (
                  <Text style={styles.waiting}>Waiting on the tenant.</Text>
                )
              ) : (
                <View style={styles.answered}>
                  <Pill
                    label={deduction.agreed ? 'Agreed' : 'Disputed'}
                    tone={deduction.agreed ? 'good' : 'bad'}
                  />
                </View>
              )}
            </View>
          ))}
        </View>

        {role === 'landlord' ? (
          adding ? (
            <View style={styles.addForm}>
              <SectionLabel>New deduction</SectionLabel>
              <Field
                label="What for"
                required
                value={label}
                onChangeText={setLabel}
                placeholder="Repaint bedroom wall"
              />
              <Field
                label="Amount"
                required
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="12000"
              />
              <Field
                label="Why"
                required
                value={reason}
                onChangeText={setReason}
                multiline
                placeholder="What changed during the tenancy, and how you know"
                error={formError}
              />
              <Text style={styles.evidenceHint}>
                Deductions backed by an inspection area are far harder to dispute. Attaching
                evidence from the comparison is not built yet, so this one will show as unbacked.
              </Text>
              <View style={styles.addActions}>
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={() => {
                    setAdding(false);
                    setFormError(null);
                  }}
                  style={{ flex: 1 }}
                />
                <Button label="Propose" onPress={propose} loading={busy} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <Button
              label="Propose a deduction"
              variant="secondary"
              onPress={() => setAdding(true)}
              style={styles.addButton}
            />
          )
        ) : null}

        {role === 'landlord' && settlement.status === 'agreed' ? (
          <Button
            label={`Settle — return ${formatLKR(totals.returning)}`}
            onPress={settle}
            loading={busy}
            style={styles.settleButton}
          />
        ) : null}

        {settlement.status === 'settled' ? (
          <View style={styles.settled}>
            <Text style={styles.settledText}>
              Settled{settlement.settledOn ? ` on ${formatDate(settlement.settledOn)}` : ''}.{' '}
              {formatLKR(totals.returning)} returned.
            </Text>
          </View>
        ) : null}

        {role === 'landlord' && settlement.status === 'disputed' ? (
          <Text style={styles.disputeNote}>
            You cannot settle while something is disputed. Either withdraw the deduction or talk it
            through — the comparison screen is the useful thing to argue from.
          </Text>
        ) : null}

        <Text style={styles.footnote}>
          RentLoop records what each side said and what the photos show. It does not decide who is
          right — that stays between you, and if it has to, a court.
        </Text>
      </ScrollView>
    </>
  );
}

const STATUS_LABEL: Record<DepositSettlement['status'], string> = {
  not_started: 'Not started',
  proposed: 'Awaiting your response',
  disputed: 'Disputed',
  agreed: 'Agreed',
  settled: 'Settled',
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  summary: { marginTop: space.sm },
  big: { ...type.moneyLarge, fontSize: 32, marginTop: space.xs, marginBottom: space.lg },
  mathRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  mathValue: { ...type.money, fontSize: 15 },
  statusRow: { flexDirection: 'row', gap: space.xs, marginTop: space.lg },
  compare: { marginTop: space.lg },

  list: { gap: space.sm },
  deduction: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.lg,
  },
  deductionTop: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  deductionLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: color.text },
  deductionAmount: { ...type.money },
  reason: { ...type.caption, fontSize: 13.5, marginTop: space.xs, lineHeight: 19 },

  evidence: {
    marginTop: space.md,
    backgroundColor: color.surfaceSunken,
    borderRadius: radius.sm,
    padding: space.md,
  },
  evidenceLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: color.textFaint },
  evidenceValue: { fontSize: 13, color: color.textMuted, marginTop: 2 },
  evidenceNone: { backgroundColor: '#FCF1DC' },
  evidenceNoneText: { fontSize: 13, color: '#8A5A00' },

  respond: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  waiting: { ...type.caption, fontSize: 12.5, marginTop: space.md, fontStyle: 'italic' },
  answered: { marginTop: space.md },

  addButton: { marginTop: space.xl },
  addForm: { marginTop: space.lg },
  evidenceHint: { ...type.caption, fontSize: 12, lineHeight: 18, marginBottom: space.lg },
  addActions: { flexDirection: 'row', gap: space.sm },
  settleButton: { marginTop: space.lg },
  settled: {
    marginTop: space.lg,
    backgroundColor: '#E6F2EB',
    borderRadius: radius.md,
    padding: space.lg,
  },
  settledText: { fontSize: 14, color: '#1B5E3F', fontWeight: '600', lineHeight: 20 },
  disputeNote: { ...type.caption, fontSize: 12.5, marginTop: space.lg, lineHeight: 18 },

  footnote: { ...type.caption, fontSize: 12, marginTop: space.xl, lineHeight: 18 },
});

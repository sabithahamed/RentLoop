import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { SlipImage } from '@/components/SlipImage';
import { StatusChip } from '@/components/StatusChip';
import { Button, Card, Divider, ErrorState, LoadingState, SectionLabel } from '@/components/ui';
import { useApp, useAsync } from '@/data/store';
import { describeDueDate, formatDate, formatLKR, formatPeriodMonth } from '@/data/ledger';
import { PAYMENT_METHOD_LABELS, type PeriodDetail } from '@/data/types';
import { color, radius, space, type } from '@/theme';

export default function PeriodDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo } = useApp();

  const { data, loading, error } = useAsync<PeriodDetail>(
    () => repo.getPeriodDetail(id),
    [id],
  );

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { period, payments } = data;
  const settled = period.balance_cents <= 0;

  return (
    <>
      <Stack.Screen options={{ title: formatPeriodMonth(period.period_month) }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.summaryTop}>
            <View>
              <Text style={type.label}>{settled ? 'Settled' : 'Still owed'}</Text>
              <Text style={styles.bigAmount}>
                {formatLKR(settled ? period.paid_cents : period.balance_cents)}
              </Text>
            </View>
            <StatusChip status={period.status} />
          </View>

          <Divider />

          <View style={styles.metaRow}>
            <Meta label="Rent due" value={formatLKR(period.amount_due_cents)} />
            <Meta label="Paid" value={formatLKR(period.paid_cents)} />
            <Meta
              label="Due date"
              value={formatDate(period.due_date)}
              sub={period.paid_cents === 0 ? describeDueDate(period.due_date) : undefined}
              subDanger={period.status === 'overdue'}
            />
          </View>
        </Card>

        <SectionLabel>
          {payments.length === 0
            ? 'No payments yet'
            : `${payments.length} ${payments.length === 1 ? 'payment' : 'payments'}`}
        </SectionLabel>

        {payments.length === 0 ? (
          <Card>
            <Text style={[type.bodyMuted, styles.emptyText]}>
              Nothing recorded for {formatPeriodMonth(period.period_month)} yet. Record a payment
              and attach the bank slip so you have the proof later.
            </Text>
          </Card>
        ) : (
          <View style={styles.paymentList}>
            {payments.map((payment) => (
              <Pressable
                key={payment.id}
                accessibilityRole="button"
                onPress={() => router.push(`/payment/${payment.id}`)}
                style={({ pressed }) => [styles.paymentRow, pressed && styles.paymentRowPressed]}
              >
                {payment.receipt_path ? (
                  <SlipImage
                    uri={payment.receipt_path}
                    amountCents={payment.amount_cents}
                    paidOn={payment.paid_on}
                    reference={payment.reference}
                    variant="thumb"
                  />
                ) : (
                  <View style={styles.noSlip}>
                    <Text style={styles.noSlipText}>No{'\n'}slip</Text>
                  </View>
                )}

                <View style={styles.paymentBody}>
                  <Text style={type.money}>{formatLKR(payment.amount_cents)}</Text>
                  <Text style={[type.caption, styles.paymentSub]}>
                    {formatDate(payment.paid_on)} · {PAYMENT_METHOD_LABELS[payment.method]}
                  </Text>
                  {payment.reference ? (
                    <Text style={styles.reference}>{payment.reference}</Text>
                  ) : null}
                  {payment.note ? (
                    <Text style={[type.caption, styles.note]} numberOfLines={2}>
                      {payment.note}
                    </Text>
                  ) : null}
                </View>

                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Button
          label={settled ? 'Record another payment' : 'Record a payment'}
          variant={settled ? 'secondary' : 'primary'}
          onPress={() => router.push(`/record-payment?periodId=${period.id}`)}
          style={styles.action}
        />
      </ScrollView>
    </>
  );
}

function Meta({
  label,
  value,
  sub,
  subDanger = false,
}: {
  label: string;
  value: string;
  sub?: string;
  subDanger?: boolean;
}) {
  return (
    <View style={styles.meta}>
      <Text style={type.label}>{label}</Text>
      <Text style={[type.money, styles.metaValue]}>{value}</Text>
      {sub ? (
        <Text style={[styles.metaSub, subDanger && { color: color.danger }]}>{sub}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },

  summaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  bigAmount: { ...type.moneyLarge, marginTop: space.xs },

  metaRow: { flexDirection: 'row', marginTop: space.lg, gap: space.md },
  meta: { flex: 1 },
  metaValue: { fontSize: 15, marginTop: space.xs },
  metaSub: { fontSize: 12, color: color.textMuted, marginTop: 2 },

  emptyText: { fontSize: 14, lineHeight: 21 },

  paymentList: { gap: space.sm },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.md,
  },
  paymentRowPressed: { backgroundColor: color.surfaceSunken },
  paymentBody: { flex: 1, gap: 2 },
  paymentSub: { fontSize: 13 },
  reference: { fontSize: 12, color: color.textFaint, fontVariant: ['tabular-nums'] },
  note: { fontSize: 12.5, fontStyle: 'italic' },
  chevron: { fontSize: 24, color: color.textFaint, marginRight: space.xs },

  noSlip: {
    width: 64,
    height: 84,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noSlipText: { fontSize: 11, color: color.textFaint, textAlign: 'center', lineHeight: 14 },

  action: { marginTop: space.xxl },
});

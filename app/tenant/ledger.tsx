import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LedgerRowItem } from '@/components/LedgerRowItem';
import { Card, ErrorState, LoadingState, SectionLabel } from '@/components/ui';
import { useApp, useAsync } from '@/data/store';
import { firstOfMonth, formatLKR, ordinal, todayISO } from '@/data/ledger';
import type { LedgerRow } from '@/data/types';
import { color, radius, space, type } from '@/theme';

export default function LedgerScreen() {
  const { session, tenancy, booting, repo, signOut } = useApp();
  const insets = useSafeAreaInsets();

  const tenancyId = tenancy?.tenancy.id ?? null;
  const { data: rows, loading, error } = useAsync<LedgerRow[]>(
    async () => (tenancyId ? repo.listLedger(tenancyId) : []),
    [tenancyId],
  );

  const thisMonth = firstOfMonth(todayISO());

  const outstanding = useMemo(() => {
    if (!rows) return { cents: 0, months: 0 };
    const behind = rows.filter((r) => r.status === 'overdue' || r.status === 'partial');
    return {
      cents: behind.reduce((sum, r) => sum + r.balance_cents, 0),
      months: behind.length,
    };
  }, [rows]);

  if (booting) return <LoadingState label="Loading your ledger" />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!tenancy) return <Redirect href="/create-tenancy" />;

  const { property, landlord, tenancy: t } = tenancy;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl },
      ]}
    >
      <View style={styles.topBar}>
        <Text style={type.caption}>Signed in as {session.displayName}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => signOut().then(() => router.replace('/sign-in'))}
          hitSlop={8}
        >
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <Card style={styles.header}>
        <Text style={type.title}>{property.label}</Text>
        {property.address_line || property.city ? (
          <Text style={[type.caption, styles.address]}>
            {[property.address_line, property.city].filter(Boolean).join(', ')}
          </Text>
        ) : null}

        <View style={styles.headerGrid}>
          <View style={styles.headerCell}>
            <Text style={type.label}>Rent</Text>
            <Text style={[type.money, styles.headerValue]}>{formatLKR(t.rent_amount_cents)}</Text>
            <Text style={styles.headerSub}>due on the {ordinal(t.due_day_of_month)}</Text>
          </View>
          <View style={styles.headerRule} />
          <View style={styles.headerCell}>
            <Text style={type.label}>Landlord</Text>
            <Text style={[type.heading, styles.headerValue]} numberOfLines={1}>
              {landlord.full_name}
            </Text>
            <Text style={styles.headerSub}>{landlord.phone ?? 'No number saved'}</Text>
          </View>
        </View>

        {/* Tenant-only mode. Connected mode is a later slice — flagged, not built. */}
        {landlord.linked_user_id === null ? (
          <View style={styles.inviteStrip}>
            <Text style={styles.inviteText}>
              {landlord.full_name.split(' ').slice(-1)[0]} is not on RentLoop yet — this ledger is
              yours alone.
            </Text>
          </View>
        ) : null}
      </Card>

      {outstanding.cents > 0 ? (
        <View style={styles.outstanding}>
          <View>
            <Text style={styles.outstandingLabel}>Outstanding</Text>
            <Text style={styles.outstandingSub}>
              across {outstanding.months} {outstanding.months === 1 ? 'month' : 'months'}
            </Text>
          </View>
          <Text style={styles.outstandingAmount}>{formatLKR(outstanding.cents)}</Text>
        </View>
      ) : null}

      <SectionLabel>Rent ledger</SectionLabel>

      {loading && !rows ? (
        <View style={styles.loadingBlock}>
          <LoadingState label="Building your ledger" />
        </View>
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <View style={styles.rows}>
          {rows?.map((row) => (
            <LedgerRowItem
              key={row.id}
              row={row}
              isCurrentMonth={row.period_month === thisMonth}
              onPress={() => router.push(`/period/${row.id}`)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  signOut: { fontSize: 13, fontWeight: '600', color: color.accent },

  header: {},
  address: { marginTop: space.xs },
  headerGrid: {
    flexDirection: 'row',
    marginTop: space.xl,
    gap: space.lg,
  },
  headerCell: { flex: 1 },
  headerRule: { width: StyleSheet.hairlineWidth, backgroundColor: color.border },
  headerValue: { marginTop: space.xs },
  headerSub: { ...type.caption, fontSize: 12, marginTop: 2 },

  inviteStrip: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  inviteText: { ...type.caption, fontSize: 12.5, lineHeight: 18 },

  outstanding: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.dangerSoft,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    marginTop: space.lg,
  },
  outstandingLabel: { fontSize: 13, fontWeight: '700', color: color.danger, letterSpacing: 0.3 },
  outstandingSub: { fontSize: 12, color: color.danger, opacity: 0.8, marginTop: 1 },
  outstandingAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: color.danger,
    fontVariant: ['tabular-nums'],
  },

  rows: { gap: space.sm },
  loadingBlock: { height: 200 },
});

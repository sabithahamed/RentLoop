import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pill, Stat } from '@/components/lifecycle';
import { Card, LoadingState, SectionLabel } from '@/components/ui';
import { useApp, useAsync } from '@/data/store';
import { formatLKR } from '@/data/ledger';
import type { PortfolioEntry } from '@/data/lifecycleTypes';
import { color, radius, space, type } from '@/theme';

/**
 * The landlord's opening screen: how much rent is late, and where.
 *
 * Deliberately not a mirror of the tenant home. A landlord with several
 * properties has one question on opening the app — who has not paid — and the
 * layout answers it before anything else.
 */
export default function LandlordPortfolio() {
  const { repo } = useApp();
  const insets = useSafeAreaInsets();

  const { data: portfolio, loading } = useAsync<PortfolioEntry[]>(() => repo.getPortfolio(), []);

  const totalArrears = portfolio?.reduce((sum, p) => sum + p.arrearsCents, 0) ?? 0;
  const expected = portfolio?.reduce((sum, p) => sum + p.rentCents, 0) ?? 0;
  const behindCount = portfolio?.filter((p) => p.arrearsCents > 0).length ?? 0;
  const openTickets = portfolio?.reduce((sum, p) => sum + p.openTicketCount, 0) ?? 0;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
      ]}
    >
      <Text style={type.caption}>Landlord view</Text>
      <Text style={[type.title, styles.heading]}>Your properties</Text>

      <Card>
        <View style={styles.stats}>
          <Stat value={formatLKR(expected)} label="Expected monthly" />
          <Stat
            value={formatLKR(totalArrears)}
            label={behindCount === 0 ? 'All collected' : `Late across ${behindCount}`}
            tone={totalArrears > 0 ? 'bad' : undefined}
          />
        </View>
        {openTickets > 0 ? (
          <Text style={styles.ticketNote}>
            {openTickets} open repair {openTickets === 1 ? 'request' : 'requests'} waiting on you.
          </Text>
        ) : null}
      </Card>

      <SectionLabel>Properties</SectionLabel>

      {loading && !portfolio ? (
        <View style={styles.loading}>
          <LoadingState />
        </View>
      ) : (
        <View style={styles.list}>
          {portfolio?.map((entry) => (
            <Pressable
              key={entry.tenancyId}
              accessibilityRole="button"
              accessibilityLabel={`${entry.propertyLabel}, ${entry.tenantName}`}
              onPress={() => router.push(`/landlord/tenancy/${entry.tenancyId}`)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{entry.propertyLabel}</Text>
                  <Text style={styles.cardTenant}>{entry.tenantName}</Text>
                </View>
                <Text style={type.money}>{formatLKR(entry.rentCents)}</Text>
              </View>

              <View style={styles.cardPills}>
                {entry.arrearsCents > 0 ? (
                  <Pill
                    label={`${formatLKR(entry.arrearsCents)} late · ${entry.monthsBehind} months`}
                    tone="bad"
                  />
                ) : (
                  <Pill label="Rent up to date" tone="good" />
                )}
                {entry.openTicketCount > 0 ? (
                  <Pill label={`${entry.openTicketCount} open repair`} tone="warn" />
                ) : null}
                {!entry.connected ? <Pill label="Tenant not on RentLoop" tone="neutral" /> : null}
              </View>

              {!entry.connected ? (
                <Text style={styles.manual}>
                  You are recording this one yourself. Invite the tenant and they keep the ledger up
                  to date for you.
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.footnote}>
        Tap a property for its tenant, arrears and repairs. A full per-tenant rent ledger is not
        built — that needs the landlord side of the payments model, which SPEC.md does not cover
        yet.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl },
  heading: { marginTop: 2, marginBottom: space.lg },
  stats: { flexDirection: 'row', gap: space.lg },
  ticketNote: {
    ...type.caption,
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  loading: { height: 160 },
  list: { gap: space.sm },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.lg,
  },
  cardPressed: { backgroundColor: color.surfaceSunken },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  cardTitle: { fontSize: 15.5, fontWeight: '600', color: color.text },
  cardTenant: { fontSize: 13, color: color.textMuted, marginTop: 2 },
  cardPills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.md },
  manual: { ...type.caption, fontSize: 12.5, marginTop: space.md, lineHeight: 18 },
  footnote: { ...type.caption, fontSize: 12, marginTop: space.lg, lineHeight: 17, fontStyle: 'italic' },
});

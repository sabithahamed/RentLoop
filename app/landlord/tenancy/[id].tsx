import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { NavRow, Pill, Stat } from '@/components/lifecycle';
import { Button, Card, ErrorState, LoadingState, SectionLabel } from '@/components/ui';
import { useApp, useAsync } from '@/data/store';
import { formatLKR } from '@/data/ledger';
import type { PortfolioEntry } from '@/data/lifecycleTypes';
import { color, radius, space, type } from '@/theme';

/**
 * One property, from the landlord's side.
 *
 * Leads with arrears because that is the question that made them tap the card.
 * A tenant who is not on RentLoop gets a different screen — there is no shared
 * ledger to show, so the honest thing is to say so and offer the invite rather
 * than render empty sections.
 */
export default function LandlordTenancyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo } = useApp();

  const { data: entry, loading, error } = useAsync<PortfolioEntry>(
    () => repo.getPortfolioEntry(id),
    [id],
  );

  if (loading && !entry) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!entry) return null;

  const behind = entry.arrearsCents > 0;

  return (
    <>
      <Stack.Screen options={{ title: entry.propertyLabel }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Card>
          <Text style={type.title}>{entry.propertyLabel}</Text>
          <Text style={[type.caption, styles.city]}>{entry.city ?? 'No city recorded'}</Text>

          <View style={styles.stats}>
            <Stat value={formatLKR(entry.rentCents)} label="Monthly rent" />
            <Stat
              value={behind ? formatLKR(entry.arrearsCents) : 'None'}
              label={behind ? `Late · ${entry.monthsBehind} months` : 'Arrears'}
              tone={behind ? 'bad' : undefined}
            />
          </View>

          <View style={styles.pills}>
            {behind ? (
              <Pill label="Rent behind" tone="bad" />
            ) : (
              <Pill label="Rent up to date" tone="good" />
            )}
            {entry.openTicketCount > 0 ? (
              <Pill label={`${entry.openTicketCount} open repair`} tone="warn" />
            ) : null}
            <Pill
              label={entry.connected ? 'Connected' : 'Tenant not on RentLoop'}
              tone={entry.connected ? 'info' : 'neutral'}
            />
          </View>
        </Card>

        <SectionLabel>Tenant</SectionLabel>
        <Card>
          <Text style={type.heading}>{entry.tenantName}</Text>
          {entry.connected ? (
            <Text style={styles.body}>
              Records the rent and repairs from their side, so this ledger stays current without
              you chasing anything.
            </Text>
          ) : (
            <>
              <Text style={styles.body}>
                Not on RentLoop, so everything here is what you have entered yourself. Invite them
                and the ledger keeps itself up to date.
              </Text>
              <Button
                label="Invite this tenant"
                variant="secondary"
                onPress={() => router.push('/invite')}
                style={styles.inviteButton}
              />
            </>
          )}
        </Card>

        {behind ? (
          <View style={styles.arrears}>
            <Text style={styles.arrearsTitle}>{formatLKR(entry.arrearsCents)} outstanding</Text>
            <Text style={styles.arrearsBody}>
              {entry.monthsBehind} months behind. A message on the record beats a phone call you
              cannot later point to.
            </Text>
            <Button
              label="Message about the rent"
              variant="secondary"
              onPress={() => router.push('/thread/new?about=payment')}
              style={styles.arrearsButton}
            />
          </View>
        ) : null}

        <SectionLabel>This tenancy</SectionLabel>
        <View style={styles.rows}>
          <NavRow
            title="Repairs"
            subtitle={
              entry.openTicketCount > 0
                ? `${entry.openTicketCount} waiting on you`
                : 'Nothing open'
            }
            badge={entry.openTicketCount > 0 ? String(entry.openTicketCount) : null}
            tone={entry.openTicketCount > 0 ? 'attention' : 'default'}
            onPress={() => router.push('/landlord/repairs')}
          />
          <NavRow
            title="Messages"
            subtitle="Conversations on this tenancy"
            onPress={() => router.push('/landlord/inbox')}
          />
          <NavRow
            title="Deposit settlement"
            subtitle="Deductions and evidence at move-out"
            onPress={() => router.push('/deposit')}
          />
        </View>

        <Text style={styles.footnote}>
          A per-tenant rent ledger with receipts is the obvious next thing here. It needs the
          landlord side of the payments model, which is not designed yet — the tenant ledger in
          SPEC.md only describes one side.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  city: { marginTop: 2 },
  stats: { flexDirection: 'row', gap: space.lg, marginTop: space.xl },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.lg },
  body: { ...type.caption, fontSize: 13.5, lineHeight: 20, marginTop: space.sm },
  inviteButton: { marginTop: space.lg },

  arrears: {
    marginTop: space.lg,
    backgroundColor: color.dangerSoft,
    borderRadius: radius.md,
    padding: space.lg,
  },
  arrearsTitle: { fontSize: 17, fontWeight: '700', color: color.danger },
  arrearsBody: { fontSize: 13, color: color.danger, opacity: 0.9, marginTop: space.xs, lineHeight: 19 },
  arrearsButton: { marginTop: space.lg },

  rows: { gap: space.sm },
  footnote: { ...type.caption, fontSize: 12, marginTop: space.xl, lineHeight: 18, fontStyle: 'italic' },
});

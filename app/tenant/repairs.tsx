import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyNote, Pill, PhotoTile } from '@/components/lifecycle';
import { Button, Card, LoadingState, SectionLabel } from '@/components/ui';
import { useApp, useAsync } from '@/data/store';
import { formatDate, formatLKR } from '@/data/ledger';
import {
  MAINTENANCE_STATUS_LABEL,
  MAINTENANCE_STATUS_TONE,
  URGENCY_LABEL,
  URGENCY_TONE,
} from '@/data/maintenanceLabels';
import type { MaintenanceTicket } from '@/data/lifecycleTypes';
import { color, radius, space, type } from '@/theme';

export default function TenantRepairs() {
  const { tenancy, repo } = useApp();
  const insets = useSafeAreaInsets();
  const tenancyId = tenancy?.tenancy.id ?? null;

  const { data: tickets, loading } = useAsync<MaintenanceTicket[]>(
    async () => (tenancyId ? repo.listTickets(tenancyId) : []),
    [tenancyId],
  );

  const open = tickets?.filter((t) => t.status !== 'resolved' && t.status !== 'declined') ?? [];
  const closed = tickets?.filter((t) => t.status === 'resolved' || t.status === 'declined') ?? [];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
      ]}
    >
      <Text style={type.title}>Repairs</Text>
      <Text style={[type.caption, styles.sub]}>
        Every issue keeps its photos and its full history, so there is no argument later about what
        was reported and when.
      </Text>

      <Button
        label="Report an issue"
        onPress={() => router.push('/maintenance/new')}
        style={styles.report}
      />

      {loading && !tickets ? (
        <View style={styles.loading}>
          <LoadingState />
        </View>
      ) : (
        <>
          <SectionLabel>Open</SectionLabel>
          {open.length === 0 ? (
            <Card>
              <EmptyNote>Nothing open right now.</EmptyNote>
            </Card>
          ) : (
            <View style={styles.list}>
              {open.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}
            </View>
          )}

          {closed.length > 0 ? (
            <>
              <SectionLabel>Closed</SectionLabel>
              <View style={styles.list}>
                {closed.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

export function TicketRow({
  ticket,
  showTenancy,
}: {
  ticket: MaintenanceTicket;
  showTenancy?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/maintenance/${ticket.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {ticket.photoUris[0] ? <PhotoTile uri={ticket.photoUris[0]} size={64} /> : null}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {ticket.title}
        </Text>
        {showTenancy ? <Text style={styles.rowTenancy}>{showTenancy}</Text> : null}
        <View style={styles.rowPills}>
          <Pill
            label={MAINTENANCE_STATUS_LABEL[ticket.status]}
            tone={MAINTENANCE_STATUS_TONE[ticket.status]}
          />
          {ticket.urgency !== 'normal' ? (
            <Pill label={URGENCY_LABEL[ticket.urgency]} tone={URGENCY_TONE[ticket.urgency]} />
          ) : null}
        </View>
        <Text style={styles.rowMeta}>
          Reported {formatDate(ticket.reported_on)}
          {ticket.costCents !== null ? ` · ${formatLKR(ticket.costCents)}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl },
  sub: { marginTop: space.xs, lineHeight: 19 },
  report: { marginTop: space.lg },
  loading: { height: 160 },
  list: { gap: space.sm },

  row: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.md,
  },
  rowPressed: { backgroundColor: color.surfaceSunken },
  rowBody: { flex: 1, gap: space.xs },
  rowTitle: { fontSize: 15, fontWeight: '600', color: color.text, lineHeight: 20 },
  rowTenancy: { fontSize: 12, color: color.accent, fontWeight: '600' },
  rowPills: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap', marginTop: 2 },
  rowMeta: { fontSize: 12, color: color.textFaint },
});

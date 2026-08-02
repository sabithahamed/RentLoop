import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { AiCard, AiDisclaimer, actorName, PhotoRow, Pill, Timeline } from '@/components/lifecycle';
import { Button, Card, ErrorState, LoadingState, SectionLabel } from '@/components/ui';
import { useApp, useAsync } from '@/data/store';
import { formatDate, formatLKR } from '@/data/ledger';
import {
  CATEGORY_LABEL,
  MAINTENANCE_STATUS_LABEL,
  MAINTENANCE_STATUS_TONE,
  NEXT_STATUSES,
  URGENCY_LABEL,
  URGENCY_TONE,
} from '@/data/maintenanceLabels';
import type { MaintenanceStatus, MaintenanceTicket } from '@/data/lifecycleTypes';
import { color, space, type } from '@/theme';

/**
 * One maintenance issue — the same record from both sides.
 *
 * The tenant sees where it has got to; the landlord sees the same thing plus
 * the buttons to move it along. That the history is identical for both is the
 * point: neither side can later claim a different version of events.
 */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, role, invalidate } = useApp();

  const { data: ticket, loading, error } = useAsync<MaintenanceTicket>(
    () => repo.getTicket(id),
    [id],
  );

  const [busy, setBusy] = useState(false);

  const advance = async (status: MaintenanceStatus) => {
    setBusy(true);
    try {
      await repo.advanceTicket(id, status, role, null);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const acceptSuggestion = async () => {
    if (!ticket?.suggestion) return;
    setBusy(true);
    try {
      await repo.classifyTicket(id, ticket.category, ticket.urgency);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  if (loading && !ticket) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!ticket) return null;

  const next = NEXT_STATUSES[ticket.status];

  return (
    <>
      <Stack.Screen options={{ title: 'Repair' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Card>
          <Text style={type.title}>{ticket.title}</Text>
          <View style={styles.pills}>
            <Pill
              label={MAINTENANCE_STATUS_LABEL[ticket.status]}
              tone={MAINTENANCE_STATUS_TONE[ticket.status]}
            />
            <Pill label={CATEGORY_LABEL[ticket.category]} tone="neutral" />
            <Pill label={URGENCY_LABEL[ticket.urgency]} tone={URGENCY_TONE[ticket.urgency]} />
          </View>

          {ticket.description ? (
            <Text style={styles.description}>{ticket.description}</Text>
          ) : null}

          <Text style={styles.meta}>
            Reported {formatDate(ticket.reported_on)} by{' '}
            {actorName(ticket.reported_by, role).toLowerCase() === 'you'
              ? 'you'
              : `the ${ticket.reported_by}`}
            {ticket.costCents !== null ? ` · cost ${formatLKR(ticket.costCents)}` : ''}
          </Text>
        </Card>

        {ticket.photoUris.length > 0 ? (
          <>
            <SectionLabel>Photos</SectionLabel>
            <PhotoRow uris={ticket.photoUris} size={104} />
          </>
        ) : null}

        {ticket.suggestion ? (
          <AiCard
            style={styles.ai}
            suggestion={ticket.suggestion}
            onAccept={ticket.suggestion.acceptedAt ? undefined : acceptSuggestion}
            onDismiss={ticket.suggestion.acceptedAt ? undefined : () => undefined}
          />
        ) : null}

        <SectionLabel>History</SectionLabel>
        <Card>
          <Timeline
            viewerRole={role}
            items={ticket.events.map((event) => ({
              id: event.id,
              label: event.label,
              note: event.note,
              meta: formatDate(event.at.slice(0, 10)),
              by: event.by,
            }))}
          />
        </Card>

        {role === 'landlord' && next.length > 0 ? (
          <>
            <SectionLabel>Your move</SectionLabel>
            <View style={styles.actions}>
              {next.map((status) => (
                <Button
                  key={status}
                  label={ACTION_LABEL[status]}
                  variant={status === 'declined' ? 'danger' : 'primary'}
                  onPress={() => advance(status)}
                  disabled={busy}
                />
              ))}
            </View>
          </>
        ) : null}

        {role === 'tenant' && ticket.status !== 'resolved' ? (
          <Button
            label="Message about this"
            variant="secondary"
            onPress={() => router.push('/thread')}
            style={styles.message}
          />
        ) : null}

        <AiDisclaimer />
      </ScrollView>
    </>
  );
}

const ACTION_LABEL: Record<MaintenanceStatus, string> = {
  reported: 'Reopen',
  acknowledged: 'Acknowledge',
  approved: 'Approve the repair',
  in_progress: 'Mark work started',
  resolved: 'Mark resolved',
  declined: 'Decline',
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.md },
  description: { ...type.body, fontSize: 14.5, lineHeight: 21, marginTop: space.lg },
  meta: { ...type.caption, fontSize: 12.5, marginTop: space.md },
  ai: { marginTop: space.lg },
  actions: { gap: space.sm },
  message: { marginTop: space.lg },
});

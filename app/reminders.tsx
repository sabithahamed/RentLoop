import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';

import { EmptyNote, Pill } from '@/components/lifecycle';
import { Card, LoadingState } from '@/components/ui';
import { useApp, useAsync } from '@/data/store';
import { formatDate } from '@/data/ledger';
import type { Reminder } from '@/data/lifecycleTypes';
import { color, radius, space, type } from '@/theme';

/**
 * Everything the app currently has a reason to nudge about.
 *
 * All of it is derived from live state rather than authored, so the list
 * empties itself as things get done — a reminders screen that has to be
 * manually cleared becomes a second to-do list nobody trusts.
 *
 * Sorted by what ignoring it costs you: money first, then deadlines you cannot
 * undo, then records that are merely incomplete.
 */
export default function RemindersScreen() {
  const { tenancy, repo, role } = useApp();
  const tenancyId = tenancy?.tenancy.id ?? null;

  const { data: reminders, loading } = useAsync<Reminder[]>(
    async () => (tenancyId ? repo.listReminders(tenancyId, role) : []),
    [tenancyId, role],
  );

  const urgent = reminders?.filter((r) => r.severity === 'urgent') ?? [];
  const soon = reminders?.filter((r) => r.severity === 'soon') ?? [];
  const info = reminders?.filter((r) => r.severity === 'info') ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Reminders' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {loading && !reminders ? (
          <View style={styles.loading}>
            <LoadingState />
          </View>
        ) : reminders && reminders.length > 0 ? (
          <>
            <Text style={[type.caption, styles.intro]}>
              Worked out from your tenancy as it stands. Nothing here was typed in by hand, and
              each one disappears when it is dealt with.
            </Text>

            {urgent.length > 0 ? <Group title="Needs attention" items={urgent} /> : null}
            {soon.length > 0 ? <Group title="Coming up" items={soon} /> : null}
            {info.length > 0 ? <Group title="Worth doing" items={info} /> : null}
          </>
        ) : (
          <Card>
            <EmptyNote>
              Nothing needs your attention. Rent is up to date, no deadlines are close, and nothing
              is waiting on you.
            </EmptyNote>
          </Card>
        )}
      </ScrollView>
    </>
  );
}

function Group({ title, items }: { title: string; items: Reminder[] }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.list}>
        {items.map((reminder) => (
          <ReminderRow key={reminder.id} reminder={reminder} />
        ))}
      </View>
    </View>
  );
}

export function ReminderRow({ reminder }: { reminder: Reminder }) {
  const tone =
    reminder.severity === 'urgent' ? 'bad' : reminder.severity === 'soon' ? 'warn' : 'neutral';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(reminder.route as never)}
      style={({ pressed }) => [
        styles.row,
        reminder.severity === 'urgent' && styles.rowUrgent,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{reminder.title}</Text>
        <Text style={styles.rowDetail}>{reminder.detail}</Text>
        {reminder.on ? (
          <View style={styles.rowMeta}>
            <Pill
              label={
                reminder.daysAway === null
                  ? formatDate(reminder.on)
                  : reminder.daysAway < 0
                    ? `${Math.abs(reminder.daysAway)} days ago`
                    : reminder.daysAway === 0
                      ? 'Today'
                      : `in ${reminder.daysAway} days`
              }
              tone={tone}
            />
          </View>
        ) : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: space.lg },
  loading: { height: 200 },
  group: { marginBottom: space.xl },
  groupTitle: { ...type.label, marginBottom: space.sm },
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.lg,
  },
  rowUrgent: { borderColor: '#E8C4C4', backgroundColor: '#FEF9F9' },
  rowPressed: { backgroundColor: color.surfaceSunken },
  rowBody: { flex: 1, gap: space.xs },
  rowTitle: { fontSize: 15, fontWeight: '600', color: color.text, lineHeight: 20 },
  rowDetail: { fontSize: 13.5, color: color.textMuted, lineHeight: 19 },
  rowMeta: { flexDirection: 'row', marginTop: space.xs },
  chevron: { fontSize: 22, color: color.textFaint },
});

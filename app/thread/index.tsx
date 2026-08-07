import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { EmptyNote, Pill } from "@/components/lifecycle";
import { Button, Card, LoadingState } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate } from "@/data/ledger";
import type { Role, Thread } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

export default function ThreadListScreen() {
  const { tenancy, repo, role } = useApp();
  const tenancyId = tenancy?.tenancy.id ?? null;

  const { data: threads, loading } = useAsync<Thread[]>(
    async () => (tenancyId ? repo.listThreads(tenancyId) : []),
    [tenancyId],
  );

  return (
    <>
      <Stack.Screen options={{ title: "Messages" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={[type.caption, styles.intro]}>
          Each conversation stays attached to the payment or repair it is about.
        </Text>

        <Button
          label="Start a conversation"
          onPress={() => router.push("/thread/new")}
          style={styles.compose}
        />

        {loading && !threads ? (
          <View style={styles.loading}>
            <LoadingState />
          </View>
        ) : threads && threads.length > 0 ? (
          <View style={styles.list}>
            {threads.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} viewerRole={role} />
            ))}
          </View>
        ) : (
          <Card>
            <EmptyNote>No conversations yet.</EmptyNote>
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const ABOUT_LABEL: Record<Thread["about"]["type"], string> = {
  general: "General",
  payment: "Rent",
  maintenance: "Repair",
  inspection: "Inspection",
};

const ABOUT_TONE = {
  general: "neutral",
  payment: "info",
  maintenance: "warn",
  inspection: "neutral",
} as const;

export function ThreadRow({ thread, viewerRole }: { thread: Thread; viewerRole: Role }) {
  const last = thread.messages[thread.messages.length - 1];
  const unread = thread.unreadFor.includes(viewerRole);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/thread/${thread.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowTop}>
        <Text style={[styles.subject, unread && styles.subjectUnread]} numberOfLines={1}>
          {thread.subject}
        </Text>
        {unread ? <View style={styles.dot} /> : null}
      </View>

      <Text style={styles.preview} numberOfLines={2}>
        {last.by === viewerRole ? "You: " : ""}
        {last.body}
      </Text>

      <View style={styles.rowBottom}>
        <Pill label={ABOUT_LABEL[thread.about.type]} tone={ABOUT_TONE[thread.about.type]} />
        <Text style={styles.time}>{formatDate(thread.lastMessageAt.slice(0, 10))}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl },
  intro: { fontSize: 13, marginBottom: space.lg, lineHeight: 19 },
  compose: { marginBottom: space.xl },
  loading: { height: 160 },
  list: { gap: space.sm },
  row: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.lg,
    gap: space.xs,
  },
  rowPressed: { backgroundColor: color.surfaceSunken },
  rowTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  subject: { flex: 1, fontSize: 15, fontWeight: "600", color: color.text },
  subjectUnread: { color: color.accent },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
  preview: { fontSize: 13.5, color: color.textMuted, lineHeight: 19 },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.xs,
  },
  time: { fontSize: 12, color: color.textFaint },
});

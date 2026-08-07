import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { Pill } from "@/components/lifecycle";
import { ErrorState, LoadingState } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate } from "@/data/ledger";
import type { Thread } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, role, invalidate } = useApp();

  const { data: thread, loading, error } = useAsync<Thread>(() => repo.getThread(id), [id]);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await repo.sendMessage(id, role, draft.trim());
      setDraft("");
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  if (loading && !thread) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!thread) return null;

  return (
    <>
      <Stack.Screen options={{ title: thread.subject }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.about}>
            <Pill
              label={
                thread.about.type === "maintenance"
                  ? "About a repair"
                  : thread.about.type === "payment"
                    ? "About rent"
                    : "General"
              }
              tone={thread.about.type === "maintenance" ? "warn" : "info"}
            />
            <Text style={styles.aboutNote}>
              Kept with the record it belongs to, so it is still findable in a year.
            </Text>
          </View>

          {thread.messages.map((message) => {
            const mine = message.by === role;
            return (
              <View
                key={message.id}
                style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}
              >
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                    {message.body}
                  </Text>
                  <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                    {formatDate(message.sent_at.slice(0, 10))}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a message"
            placeholderTextColor={color.textFaint}
            style={styles.input}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            onPress={send}
            disabled={busy || !draft.trim()}
            style={({ pressed }) => [
              styles.send,
              (!draft.trim() || busy) && styles.sendDisabled,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xl },
  about: { alignItems: "center", gap: space.sm, marginBottom: space.xl },
  aboutNote: { ...type.caption, fontSize: 12, textAlign: "center" },

  bubbleRow: { flexDirection: "row", marginBottom: space.md },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "82%", borderRadius: radius.md, padding: space.md },
  bubbleMine: { backgroundColor: color.accent, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: color.surface,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  bubbleText: { fontSize: 14.5, color: color.text, lineHeight: 20 },
  bubbleTextMine: { color: color.textInverse },
  bubbleTime: { fontSize: 11, color: color.textFaint, marginTop: space.xs },
  bubbleTimeMine: { color: "rgba(255,255,255,0.75)" },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    padding: space.md,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSunken,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    fontSize: 15,
    color: color.text,
  },
  send: {
    height: 42,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: color.textInverse, fontWeight: "600", fontSize: 14 },
});

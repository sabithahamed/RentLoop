import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";

import { Button, Field, SectionLabel, SegmentedControl } from "@/components/ui";
import { useApp } from "@/data/store";
import type { ThreadSubjectType } from "@/data/lifecycleTypes";
import { color, space, type } from "@/theme";

const ABOUT_OPTIONS: { value: ThreadSubjectType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "payment", label: "Rent" },
  { value: "maintenance", label: "Repair" },
];

/**
 * Starting a conversation.
 *
 * Asking what it is about up front is the whole design. A thread tagged to
 * rent or a repair is findable a year later when it matters; an untagged one
 * is just a message that happened to be sent inside this app instead of
 * WhatsApp, which buys nobody anything.
 */
export default function NewThreadScreen() {
  const { about: aboutParam, id: aboutId } = useLocalSearchParams<{
    about?: string;
    id?: string;
  }>();
  const { tenancy, repo, role, invalidate } = useApp();

  const [subject, setSubject] = useState("");
  const [about, setAbout] = useState<ThreadSubjectType>(
    aboutParam === "payment" || aboutParam === "maintenance" ? aboutParam : "general",
  );
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!tenancy) return;
    if (!subject.trim()) {
      setError("Give it a subject so it can be found later");
      return;
    }
    if (!body.trim()) {
      setError("Write your message");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const thread = await repo.startThread({
        tenancyId: tenancy.tenancy.id,
        subject: subject.trim(),
        about: { type: about, id: aboutId ?? null },
        by: role,
        body: body.trim(),
      });
      invalidate();
      router.replace(`/thread/${thread.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the conversation");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "New conversation", presentation: "modal" }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={60}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[type.caption, styles.intro]}>
            Anchoring this to what it is about is what makes it findable later — and what makes it
            usable as evidence if it ever comes to that.
          </Text>

          <SegmentedControl<ThreadSubjectType>
            label="What is this about?"
            value={about}
            onChange={setAbout}
            options={ABOUT_OPTIONS}
          />

          <Field
            label="Subject"
            required
            value={subject}
            onChangeText={setSubject}
            placeholder={
              about === "payment"
                ? "Paying late this month"
                : about === "maintenance"
                  ? "Kitchen tap"
                  : "Water bill share"
            }
          />

          <Field
            label="Message"
            required
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="Write your message"
            error={error}
          />

          <SectionLabel>Who sees it</SectionLabel>
          <Text style={styles.note}>
            {tenancy?.landlord.linked_user_id
              ? `${tenancy.landlord.full_name} sees this in their RentLoop inbox.`
              : `${tenancy?.landlord.full_name ?? "Your landlord"} is not on RentLoop yet, so this is recorded on your side only. It still timestamps what you said and when — which is worth having.`}
          </Text>

          <Button label="Send" onPress={submit} loading={busy} style={styles.submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  intro: { fontSize: 13.5, lineHeight: 19, marginBottom: space.xl },
  note: { ...type.caption, fontSize: 13, lineHeight: 19 },
  submit: { marginTop: space.xl },
});

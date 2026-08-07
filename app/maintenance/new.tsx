import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { AgentTrace, TriageCard } from "@/components/AgentTrace";
import { PhotoRow, Pill } from "@/components/lifecycle";
import { Button, Field, SectionLabel } from "@/components/ui";
import { useApp } from "@/data/store";
import { CATEGORIES, CATEGORY_LABEL } from "@/data/maintenanceLabels";
import { GEMINI_MODEL, hasGeminiKey } from "@/agent/geminiClient";
import { runMaintenanceTriage } from "@/agent/maintenanceAgent";
import type { AgentRun, AgentStep } from "@/agent/types";
import { color, radius, space, type } from "@/theme";

/**
 * Reporting an issue.
 *
 * Photos come first because they are the part people skip and the part that
 * settles arguments. Classification happens after saving, not here — asking a
 * tenant to pick "structural vs appliance" before they have described anything
 * is asking them to do the assistant's job.
 */
export default function NewTicketScreen() {
  const { tenancy, repo, role, invalidate } = useApp();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agent state. Steps are held separately from `run` so they can stream in
  // while the loop is still going.
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);

  const triage = async () => {
    if (!tenancy || !title.trim()) return;
    setRunning(true);
    setSteps([]);
    setRun(null);
    setError(null);
    try {
      const finished = await runMaintenanceTriage(
        { title: title.trim(), description: description.trim(), photoUris },
        { repo, tenancyId: tenancy.tenancy.id },
        (step) => setSteps((current) => [...current, step]),
      );
      setRun(finished);
    } finally {
      setRunning(false);
    }
  };

  const addPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "RentLoop needs access to your photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUris((current) => [...current, result.assets[0].uri]);
    }
  };

  const submit = async () => {
    if (!tenancy) return;
    if (!title.trim()) {
      setError("Give the issue a short title");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ticket = await repo.createTicket({
        tenancyId: tenancy.tenancy.id,
        title: title.trim(),
        description: description.trim(),
        photoUris,
        by: role,
      });

      // The agent's answer wins over the keyword fallback inside createTicket,
      // but only because the tenant saw it and chose to send it.
      if (run?.result) {
        await repo.classifyTicket(ticket.id, run.result.category, run.result.urgency);
      }

      invalidate();
      router.replace(`/maintenance/${ticket.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Report an issue", presentation: "modal" }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={60}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[type.caption, styles.intro]}>
            Your landlord sees this along with the photos and the time you reported it. That record
            does not change afterwards.
          </Text>

          <Field
            label="What is wrong?"
            required
            value={title}
            onChangeText={setTitle}
            placeholder="Damp patch on bathroom ceiling"
          />

          <Field
            label="Describe it"
            value={description}
            onChangeText={setDescription}
            placeholder="When it started, whether it is getting worse, anything you have tried"
            multiline
          />

          <SectionLabel>Photos</SectionLabel>
          <PhotoRow uris={photoUris} />
          <Pressable
            accessibilityRole="button"
            onPress={addPhoto}
            style={({ pressed }) => [styles.addPhoto, pressed && styles.addPhotoPressed]}
          >
            <Text style={styles.addPhotoText}>
              {photoUris.length === 0 ? "Add a photo" : "Add another"}
            </Text>
          </Pressable>

          <SectionLabel>Before you send it</SectionLabel>

          {run || running ? (
            <>
              <AgentTrace
                steps={steps}
                running={running}
                model={run?.model ?? GEMINI_MODEL}
                elapsedMs={run?.elapsedMs}
              />
              {run?.result ? <TriageCard result={run.result} /> : null}
              {run?.error && !run.result ? (
                <Text style={styles.agentError}>{run.error}</Text>
              ) : null}
              {!running ? (
                <Button
                  label="Run it again"
                  variant="ghost"
                  onPress={triage}
                  style={styles.rerun}
                />
              ) : null}
            </>
          ) : (
            <View style={styles.aiHint}>
              <Pill label="ASSISTANT" tone="info" />
              <Text style={styles.aiHintText}>
                {hasGeminiKey()
                  ? "I can read your agreement, check your move-in photos and look for issues you already reported, then tell you how urgent this is and who is likely to pay."
                  : "Set EXPO_PUBLIC_GEMINI_API_KEY in .env to enable the assistant. Without it you can still report the issue."}
              </Text>
            </View>
          )}

          {hasGeminiKey() && !run && !running ? (
            <Button
              label="Ask the assistant"
              variant="secondary"
              onPress={triage}
              disabled={!title.trim()}
              style={styles.askButton}
            />
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={run?.result ? "Report it, with the triage" : "Report it"}
            onPress={submit}
            loading={busy}
            style={styles.submit}
          />

          <Text style={styles.categories}>
            Categories: {CATEGORIES.map((c) => CATEGORY_LABEL[c]).join(" · ")}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  intro: { fontSize: 13.5, lineHeight: 19, marginBottom: space.xl },

  addPhoto: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.borderStrong,
    borderRadius: radius.md,
    padding: space.lg,
    alignItems: "center",
    backgroundColor: color.surface,
    marginTop: space.sm,
  },
  addPhotoPressed: { backgroundColor: color.surfaceSunken },
  addPhotoText: { fontSize: 15, fontWeight: "600", color: color.accent },

  aiHint: {
    flexDirection: "row",
    gap: space.md,
    alignItems: "flex-start",
    backgroundColor: "#F4F1FB",
    borderRadius: radius.md,
    padding: space.lg,
    marginTop: space.xl,
  },
  aiHintText: { flex: 1, fontSize: 13, color: "#5B5480", lineHeight: 19 },

  agentError: { ...type.caption, color: color.danger, marginTop: space.md, lineHeight: 18 },
  rerun: { marginTop: space.sm },
  askButton: { marginTop: space.lg },

  error: { ...type.caption, color: color.danger, marginTop: space.md },
  submit: { marginTop: space.xl },
  categories: { ...type.caption, fontSize: 11.5, marginTop: space.lg, textAlign: "center" },
});

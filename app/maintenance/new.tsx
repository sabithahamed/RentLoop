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

import { PhotoRow, Pill } from "@/components/lifecycle";
import { Button, Field, SectionLabel } from "@/components/ui";
import { useApp } from "@/data/store";
import { CATEGORIES, CATEGORY_LABEL } from "@/data/maintenanceLabels";
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

          <View style={styles.aiHint}>
            <Pill label="ASSISTANT" tone="info" />
            <Text style={styles.aiHintText}>
              Once you save, I will suggest a category and how urgent this looks. You can change
              both.
            </Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label="Report it" onPress={submit} loading={busy} style={styles.submit} />

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

  error: { ...type.caption, color: color.danger, marginTop: space.md },
  submit: { marginTop: space.xl },
  categories: { ...type.caption, fontSize: 11.5, marginTop: space.lg, textAlign: "center" },
});

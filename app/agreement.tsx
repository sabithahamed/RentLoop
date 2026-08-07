import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { AiDisclaimer, Pill } from "@/components/lifecycle";
import { Button, Card, ErrorState, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import type { Agreement } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

/**
 * The agreement, as read by the assistant and confirmed by the tenant.
 *
 * The screen is built around one idea: extraction is a draft. Every term shows
 * what the document actually says next to it, and nothing becomes a reminder
 * until a person has agreed it is right. Low-confidence terms are visually
 * separated rather than quietly mixed in with the ones we are sure about.
 */
export default function AgreementScreen() {
  const { tenancy, repo, invalidate } = useApp();
  const tenancyId = tenancy?.tenancy.id ?? null;

  const {
    data: agreement,
    loading,
    error,
  } = useAsync<Agreement | null>(
    async () => (tenancyId ? repo.getAgreement(tenancyId) : null),
    [tenancyId],
  );

  const [busy, setBusy] = useState(false);

  const confirm = async (termId: string, value: string) => {
    if (!agreement) return;
    setBusy(true);
    try {
      await repo.confirmTerm(agreement.id, termId, value);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Photographing the agreement rather than picking a PDF is deliberate: most
   * Sri Lankan rental agreements exist only on paper, and a photo of page one
   * is what a tenant can actually produce standing in the kitchen.
   */
  const upload = async () => {
    if (!tenancyId) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    const useLibrary = !permission.granted;
    if (useLibrary) {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        Alert.alert(
          "Permission needed",
          "RentLoop needs the camera or your photos to read the agreement.",
        );
        return;
      }
    }

    const result = useLibrary
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 })
      : await ImagePicker.launchCameraAsync({ quality: 0.7 });

    if (result.canceled || !result.assets[0]) return;

    setBusy(true);
    try {
      await repo.uploadAgreement(tenancyId, "Rental agreement (photo)");
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  if (loading && !agreement) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  if (!agreement) {
    return (
      <>
        <Stack.Screen options={{ title: "Agreement" }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <Card>
            <Text style={type.heading}>No agreement uploaded</Text>
            <Text style={styles.emptyText}>
              Upload it once and the rent, deposit, notice period and end date become reminders
              instead of things you have to remember.
            </Text>
            <Button
              label="Photograph the agreement"
              onPress={upload}
              loading={busy}
              style={styles.uploadButton}
            />
            <Text style={styles.uploadNote}>
              Most agreements here only exist on paper, so a photo of each page is the realistic
              input. In the prototype the extraction is canned rather than run on your photo.
            </Text>
          </Card>
        </ScrollView>
      </>
    );
  }

  const confident = agreement.terms.filter((t) => t.confidence >= 0.85);
  const uncertain = agreement.terms.filter((t) => t.confidence < 0.85);
  const remaining = agreement.terms.filter((t) => !t.confirmed).length;

  return (
    <>
      <Stack.Screen options={{ title: "Agreement" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Card>
          <Text style={type.heading}>{agreement.file_name}</Text>
          <View style={styles.statusRow}>
            {agreement.status === "confirmed" ? (
              <Pill label="All terms confirmed" tone="good" />
            ) : (
              <Pill label={`${remaining} left to confirm`} tone="warn" />
            )}
          </View>
          <Text style={styles.explain}>
            I read the document and pulled these out. Nothing here becomes a reminder until you
            confirm it — check each one against what you remember agreeing.
          </Text>
        </Card>

        <SectionLabel>Terms I am confident about</SectionLabel>
        <View style={styles.list}>
          {confident.map((term) => (
            <TermCard
              key={term.id}
              term={term}
              busy={busy}
              onConfirm={() => confirm(term.id, term.value)}
            />
          ))}
        </View>

        {uncertain.length > 0 ? (
          <>
            <SectionLabel>Worth checking yourself</SectionLabel>
            <View style={styles.list}>
              {uncertain.map((term) => (
                <TermCard
                  key={term.id}
                  term={term}
                  busy={busy}
                  onConfirm={() => confirm(term.id, term.value)}
                />
              ))}
            </View>
          </>
        ) : null}

        {agreement.flaggedClauses.length > 0 ? (
          <>
            <SectionLabel>Clauses worth a second look</SectionLabel>
            <View style={styles.list}>
              {agreement.flaggedClauses.map((clause) => (
                <View key={clause.id} style={styles.flagged}>
                  <Text style={styles.flaggedQuote}>“{clause.text}”</Text>
                  <Text style={styles.flaggedReason}>{clause.reason}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.legalNote}>
              This is not legal advice. It is a note that something reads unusually, so you can ask
              someone who knows.
            </Text>
          </>
        ) : null}

        {agreement.endsOn ? (
          <Button
            label="Decide about renewal"
            variant="secondary"
            onPress={() => router.push("/renewal")}
            style={styles.renewalButton}
          />
        ) : null}

        <AiDisclaimer />
      </ScrollView>
    </>
  );
}

function TermCard({
  term,
  busy,
  onConfirm,
}: {
  term: Agreement["terms"][0];
  busy: boolean;
  onConfirm: () => void;
}) {
  const [showSource, setShowSource] = useState(false);

  return (
    <View style={[styles.term, term.confirmed && styles.termConfirmed]}>
      <View style={styles.termTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.termLabel}>{term.label}</Text>
          <Text style={styles.termValue}>{term.value}</Text>
        </View>
        {term.confirmed ? (
          <Pill label="Confirmed" tone="good" />
        ) : (
          <Text style={styles.termConfidence}>{Math.round(term.confidence * 100)}%</Text>
        )}
      </View>

      {term.sourceQuote ? (
        <Pressable accessibilityRole="button" onPress={() => setShowSource((s) => !s)} hitSlop={6}>
          <Text style={styles.sourceToggle}>
            {showSource ? "Hide the wording" : "Show me where this came from"}
          </Text>
        </Pressable>
      ) : null}

      {showSource && term.sourceQuote ? (
        <Text style={styles.sourceQuote}>“{term.sourceQuote}”</Text>
      ) : null}

      {!term.confirmed ? (
        <Button
          label="That's right"
          variant="secondary"
          onPress={onConfirm}
          disabled={busy}
          style={styles.termButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },

  emptyText: { ...type.bodyMuted, fontSize: 14, lineHeight: 21, marginTop: space.sm },
  uploadButton: { marginTop: space.lg },
  uploadNote: { ...type.caption, fontSize: 12, marginTop: space.sm, fontStyle: "italic" },

  statusRow: { marginTop: space.md },
  explain: { ...type.caption, fontSize: 13, lineHeight: 19, marginTop: space.md },

  list: { gap: space.sm },
  term: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.lg,
  },
  termConfirmed: { backgroundColor: color.surfaceSunken },
  termTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  termLabel: { ...type.label },
  termValue: { fontSize: 16, fontWeight: "600", color: color.text, marginTop: 3 },
  termConfidence: { fontSize: 12, color: color.textFaint, fontVariant: ["tabular-nums"] },
  sourceToggle: { fontSize: 12.5, color: color.accent, fontWeight: "600", marginTop: space.md },
  sourceQuote: {
    fontSize: 13,
    fontStyle: "italic",
    color: color.textMuted,
    marginTop: space.sm,
    lineHeight: 19,
    paddingLeft: space.md,
    borderLeftWidth: 2,
    borderLeftColor: color.borderStrong,
  },
  termButton: { marginTop: space.md, height: 42 },

  flagged: {
    backgroundColor: "#FCF1DC",
    borderRadius: radius.md,
    padding: space.lg,
  },
  flaggedQuote: { fontSize: 14, fontStyle: "italic", color: "#6B4500", lineHeight: 20 },
  flaggedReason: { fontSize: 13, color: "#8A5A00", marginTop: space.sm, lineHeight: 19 },
  legalNote: { ...type.caption, fontSize: 12, marginTop: space.md, lineHeight: 17 },
  renewalButton: { marginTop: space.xl },
});

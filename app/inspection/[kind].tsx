import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { AiCard, AiDisclaimer, PhotoTile, Pill, severityTone } from "@/components/lifecycle";
import { Button, Card, ErrorState, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate } from "@/data/ledger";
import type { InspectionKind, InspectionSession } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

/**
 * The inspection checklist.
 *
 * Grouped by room rather than presented as one long list, because that is how
 * someone actually walks a property. Required areas that are still empty are
 * pulled to the top of their room and the assistant explains *why* each one
 * matters — "photograph the ceiling" is ignorable, "ceilings are where damp
 * shows first and it is the most disputed area at move-out" is not.
 */
export default function InspectionScreen() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const inspectionKind: InspectionKind = kind === "move_out" ? "move_out" : "move_in";

  const { tenancy, repo, invalidate } = useApp();
  const tenancyId = tenancy?.tenancy.id ?? null;

  const {
    data: session,
    loading,
    error,
  } = useAsync<InspectionSession | null>(
    async () => (tenancyId ? repo.getInspection(tenancyId, inspectionKind) : null),
    [tenancyId, inspectionKind],
  );

  const [busy, setBusy] = useState(false);

  const rooms = useMemo(() => {
    if (!session) return [];
    const byRoom = new Map<string, InspectionSession["areas"]>();
    for (const area of session.areas) {
      byRoom.set(area.room, [...(byRoom.get(area.room) ?? []), area]);
    }
    // Unphotographed required areas first within each room.
    return [...byRoom.entries()].map(([room, areas]) => ({
      room,
      areas: [...areas].sort((a, b) => {
        const aNeeds = a.required && a.photos.length === 0 ? 0 : 1;
        const bNeeds = b.required && b.photos.length === 0 ? 0 : 1;
        return aNeeds - bNeeds;
      }),
    }));
  }, [session]);

  const capture = async (areaId: string) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    const useLibrary = !permission.granted;

    if (useLibrary) {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        Alert.alert(
          "Permission needed",
          "RentLoop needs the camera or your photos to record evidence.",
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
      await repo.addInspectionPhoto(areaId, result.assets[0].uri, null);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await repo.completeInspection(session.id);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  if (loading && !session) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!session) return null;

  const captured = session.areas.filter((a) => a.photos.length > 0).length;
  const missingRequired = session.areas.filter((a) => a.required && a.photos.length === 0).length;
  const title = inspectionKind === "move_in" ? "Move-in inspection" : "Move-out inspection";

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>
                {session.status === "complete" ? "Complete" : "In progress"}
              </Text>
              <Text style={styles.progress}>
                {captured} of {session.areas.length} areas
              </Text>
              {session.completed_on ? (
                <Text style={type.caption}>Recorded {formatDate(session.completed_on)}</Text>
              ) : null}
            </View>
            {missingRequired > 0 ? (
              <Pill label={`${missingRequired} required missing`} tone="warn" />
            ) : (
              <Pill label="Nothing missing" tone="good" />
            )}
          </View>

          <View style={styles.bar}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.round((captured / session.areas.length) * 100)}%` },
              ]}
            />
          </View>

          <Text style={styles.purpose}>
            {inspectionKind === "move_in"
              ? "These photos are timestamped. At move-out they are what decides whether damage was yours."
              : "These get compared against your move-in photos, area by area."}
          </Text>
        </Card>

        {session.suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            {session.suggestions.map((suggestion) => (
              <AiCard key={suggestion.id} suggestion={suggestion} />
            ))}
          </View>
        ) : null}

        {rooms.map(({ room, areas }) => (
          <View key={room}>
            <SectionLabel>{room}</SectionLabel>
            <View style={styles.list}>
              {areas.map((area) => {
                const photo = area.photos[0];
                return (
                  <Pressable
                    key={area.id}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => capture(area.id)}
                    style={({ pressed }) => [styles.area, pressed && styles.areaPressed]}
                  >
                    {photo ? (
                      <PhotoTile uri={photo.uri} size={56} />
                    ) : (
                      <View style={styles.placeholder}>
                        <Text style={styles.placeholderGlyph}>＋</Text>
                      </View>
                    )}

                    <View style={styles.areaBody}>
                      <Text style={styles.areaName}>{area.name}</Text>
                      {photo?.note ? (
                        <Text style={styles.areaNote} numberOfLines={2}>
                          {photo.note}
                        </Text>
                      ) : (
                        <Text style={styles.areaHint}>
                          {area.photos.length > 0
                            ? `${area.photos.length} photo${area.photos.length === 1 ? "" : "s"}`
                            : area.required
                              ? "Required"
                              : "Optional"}
                        </Text>
                      )}
                      {photo && photo.findings.length > 0 ? (
                        <View style={styles.findings}>
                          {photo.findings.map((finding) => (
                            <Pill
                              key={finding.id}
                              label={finding.label}
                              tone={severityTone[finding.severity]}
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>

                    {area.photos.length === 0 && area.required ? (
                      <View style={styles.requiredDot} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {session.status !== "complete" ? (
          <Button
            label={
              missingRequired > 0 ? `Finish anyway (${missingRequired} missing)` : "Mark complete"
            }
            variant={missingRequired > 0 ? "secondary" : "primary"}
            onPress={complete}
            loading={busy}
            style={styles.finish}
          />
        ) : inspectionKind === "move_out" ? (
          <Button
            label="Compare with move-in"
            onPress={() => router.push(`/inspection/compare?tenancyId=${session.tenancy_id}`)}
            style={styles.finish}
          />
        ) : null}

        <AiDisclaimer />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },

  headerTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  progress: { ...type.moneyLarge, fontSize: 22, marginTop: space.xs },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.surfaceSunken,
    marginTop: space.lg,
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: color.accent, borderRadius: 3 },
  purpose: { ...type.caption, fontSize: 13, lineHeight: 19, marginTop: space.md },

  suggestions: { gap: space.sm, marginTop: space.lg },

  list: { gap: space.sm },
  area: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.md,
  },
  areaPressed: { backgroundColor: color.surfaceSunken },
  placeholder: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderGlyph: { fontSize: 20, color: color.textFaint },
  areaBody: { flex: 1, gap: 2 },
  areaName: { fontSize: 15, fontWeight: "600", color: color.text },
  areaHint: { fontSize: 12.5, color: color.textFaint },
  areaNote: { fontSize: 12.5, color: color.textMuted, fontStyle: "italic" },
  findings: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xs },
  requiredDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#C79A2E" },

  finish: { marginTop: space.xxl },
});

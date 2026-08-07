import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";

import { AiDisclaimer, PhotoTile, Pill, severityTone } from "@/components/lifecycle";
import { Card, ErrorState, LoadingState, SectionLabel, Button } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate } from "@/data/ledger";
import type { AreaComparison } from "@/data/lifecycleTypes";
import type { TenancySummary } from "@/data/types";
import { color, radius, space, type } from "@/theme";

/**
 * Move-in against move-out, area by area.
 *
 * The whole deposit argument comes down to one question — was this like that
 * when you arrived — so the two photos sit side by side and anything the
 * assistant thinks is new is called out between them. Areas with no change are
 * kept, quietly, because "nothing changed here" is also evidence.
 */
export default function CompareScreen() {
  const { tenancyId } = useLocalSearchParams<{ tenancyId?: string }>();
  const { tenancy, repo } = useApp();

  // A comparison only means anything once a tenancy has ended, so an unqualified
  // visit should land on the ended one rather than the active tenancy — which
  // has a move-in and nothing to compare it against.
  const { data: tenancies } = useAsync<TenancySummary[]>(() => repo.listTenancies(), []);
  const ended = tenancies?.find((t) => t.tenancy.status === "ended") ?? null;
  const targetId = tenancyId ?? ended?.tenancy.id ?? tenancy?.tenancy.id ?? null;

  const { data, loading, error } = useAsync<AreaComparison[]>(
    async () => (targetId ? repo.compareInspections(targetId) : []),
    [targetId],
  );

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const changed = data?.filter((c) => c.changes.length > 0) ?? [];
  const unchanged = data?.filter((c) => c.changes.length === 0) ?? [];

  return (
    <>
      <Stack.Screen options={{ title: "Move-in vs move-out" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Card>
          <Text style={type.heading}>
            {changed.length === 0
              ? "No new damage found"
              : `${changed.length} ${changed.length === 1 ? "area has" : "areas have"} changed`}
          </Text>
          <Text style={styles.intro}>
            Compared {data?.length ?? 0} areas photographed at both ends of the tenancy. Anything
            flagged below is a suggestion — the photos are the evidence, not the label.
          </Text>
        </Card>

        {changed.length > 0 ? (
          <>
            <SectionLabel>Changed</SectionLabel>
            <View style={styles.list}>
              {changed.map((comparison) => (
                <ComparisonCard
                  key={`${comparison.room}-${comparison.areaName}`}
                  comparison={comparison}
                />
              ))}
            </View>
          </>
        ) : null}

        {unchanged.length > 0 ? (
          <>
            <SectionLabel>Unchanged</SectionLabel>
            <View style={styles.list}>
              {unchanged.map((comparison) => (
                <ComparisonCard
                  key={`${comparison.room}-${comparison.areaName}`}
                  comparison={comparison}
                  compact
                />
              ))}
            </View>
          </>
        ) : null}

        {targetId ? (
          <Button
            label="Go to deposit settlement"
            onPress={() => router.push(`/deposit?tenancyId=${targetId}`)}
            style={styles.action}
          />
        ) : null}

        <AiDisclaimer />
      </ScrollView>
    </>
  );
}

function ComparisonCard({
  comparison,
  compact = false,
}: {
  comparison: AreaComparison;
  compact?: boolean;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {comparison.room} · {comparison.areaName}
      </Text>

      <View style={styles.pair}>
        <View style={styles.side}>
          <Text style={styles.sideLabel}>MOVE-IN</Text>
          {comparison.moveInPhoto ? (
            <>
              <PhotoTile uri={comparison.moveInPhoto.uri} size={compact ? 64 : 104} />
              <Text style={styles.sideDate}>
                {formatDate(comparison.moveInPhoto.captured_at.slice(0, 10))}
              </Text>
            </>
          ) : (
            <Text style={styles.missing}>Not photographed</Text>
          )}
        </View>

        <Text style={styles.arrow}>→</Text>

        <View style={styles.side}>
          <Text style={styles.sideLabel}>MOVE-OUT</Text>
          {comparison.moveOutPhoto ? (
            <>
              <PhotoTile uri={comparison.moveOutPhoto.uri} size={compact ? 64 : 104} />
              <Text style={styles.sideDate}>
                {formatDate(comparison.moveOutPhoto.captured_at.slice(0, 10))}
              </Text>
            </>
          ) : (
            <Text style={styles.missing}>Not photographed</Text>
          )}
        </View>
      </View>

      {comparison.changes.length > 0 ? (
        <View style={styles.changes}>
          {comparison.changes.map((change) => (
            <Pill
              key={change.label}
              label={`${change.label} · ${Math.round(change.confidence * 100)}%`}
              tone={severityTone[change.severity]}
            />
          ))}
        </View>
      ) : null}

      {comparison.moveOutPhoto?.note ? (
        <Text style={styles.note}>“{comparison.moveOutPhoto.note}”</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  intro: { ...type.caption, fontSize: 13, lineHeight: 19, marginTop: space.sm },
  list: { gap: space.sm },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.lg,
  },
  cardTitle: { fontSize: 14.5, fontWeight: "600", color: color.text, marginBottom: space.md },
  pair: { flexDirection: "row", alignItems: "center", gap: space.md },
  side: { flex: 1, alignItems: "center", gap: space.xs },
  sideLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8, color: color.textFaint },
  sideDate: { fontSize: 11, color: color.textFaint },
  arrow: { fontSize: 18, color: color.textFaint },
  missing: { fontSize: 12, color: color.textFaint, fontStyle: "italic", paddingVertical: space.xl },
  changes: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.md },
  note: { fontSize: 13, fontStyle: "italic", color: color.textMuted, marginTop: space.sm },
  action: { marginTop: space.xxl },
});

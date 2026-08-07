import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NavRow, Pill } from "@/components/lifecycle";
import { Button, Card, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate, formatLKR, ordinal } from "@/data/ledger";
import type { LifecycleOverview } from "@/data/lifecycleTypes";
import { color, space, type } from "@/theme";

/** The property hub: the documents and evidence attached to where you live. */
export default function TenantProperty() {
  const { tenancy, repo, booting } = useApp();
  const insets = useSafeAreaInsets();
  const tenancyId = tenancy?.tenancy.id ?? null;

  const { data: overview } = useAsync<LifecycleOverview | null>(
    async () => (tenancyId ? repo.getOverview(tenancyId) : null),
    [tenancyId],
  );

  if (booting) return <LoadingState />;
  if (!tenancy) return <Redirect href="/create-tenancy" />;

  const { property, landlord, tenancy: t } = tenancy;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
      ]}
    >
      <Text style={type.title}>{property.label}</Text>
      <Text style={[type.caption, styles.address]}>
        {[property.address_line, property.city].filter(Boolean).join(", ") || "No address saved"}
      </Text>

      <Card style={styles.facts}>
        <Row
          label="Rent"
          value={`${formatLKR(t.rent_amount_cents)} · due on the ${ordinal(t.due_day_of_month)}`}
        />
        <Row label="Tenancy started" value={formatDate(t.started_on)} />
        <Row label="Landlord" value={landlord.full_name} />
        <Row label="Contact" value={landlord.phone ?? "No number saved"} last />
      </Card>

      {landlord.linked_user_id === null ? (
        <Card style={styles.connect}>
          <Pill label="TENANT-ONLY MODE" tone="info" />
          <Text style={styles.connectText}>
            {landlord.full_name} is not on RentLoop. Everything here still works — the records are
            yours. If they join, you both see the same ledger, repairs and evidence instead of
            arguing from separate memories.
          </Text>
          <Button
            label={`Invite ${landlord.full_name}`}
            variant="secondary"
            onPress={() => router.push("/invite")}
            style={styles.connectButton}
          />
        </Card>
      ) : (
        <Card style={styles.connect}>
          <Pill label="CONNECTED" tone="good" />
          <Text style={styles.connectText}>
            {landlord.full_name} is on RentLoop. You are both looking at the same ledger, the same
            repairs and the same evidence.
          </Text>
        </Card>
      )}

      <SectionLabel>Documents and evidence</SectionLabel>
      <View style={styles.rows}>
        <NavRow
          title="Rental agreement"
          subtitle={
            overview?.agreementStatus === "confirmed"
              ? "Confirmed — reminders are set from it"
              : overview?.agreementStatus === "needs_review"
                ? "Terms need your confirmation"
                : "Not uploaded"
          }
          tone={overview?.agreementStatus === "needs_review" ? "attention" : "default"}
          onPress={() => router.push("/agreement")}
        />
        <NavRow
          title="Move-in inspection"
          subtitle={
            overview?.moveInStatus === "complete" ? "Complete" : "Incomplete — worth finishing"
          }
          tone={overview?.moveInStatus === "complete" ? "default" : "attention"}
          onPress={() => router.push("/inspection/move_in")}
        />
        <NavRow
          title="Move-out inspection"
          subtitle={
            overview?.moveOutStatus === "complete" ? "Complete" : "Start this when you are leaving"
          }
          onPress={() => router.push("/inspection/move_out")}
        />
        <NavRow
          title="Renewal and notice"
          subtitle="Decide whether you are staying on"
          onPress={() => router.push("/renewal")}
        />
      </View>

      <Text style={styles.footnote}>
        Move-in photos are the only thing that reliably settles a deposit dispute. They are worth
        the twenty minutes.
      </Text>
    </ScrollView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={type.bodyMuted}>{label}</Text>
      <Text style={[type.body, styles.rowValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl },
  address: { marginTop: 2, marginBottom: space.lg },
  facts: { paddingVertical: 0 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.lg,
    paddingVertical: space.md,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  rowValue: { flex: 1, textAlign: "right", fontSize: 14 },

  connect: { marginTop: space.lg },
  connectText: { ...type.caption, fontSize: 13.5, lineHeight: 20, marginTop: space.md },
  connectButton: { marginTop: space.lg },

  rows: { gap: space.sm },
  footnote: { ...type.caption, fontSize: 12.5, marginTop: space.lg, lineHeight: 18 },
});

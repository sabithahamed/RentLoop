import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { Pill } from "@/components/lifecycle";
import { Button, Card, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate } from "@/data/ledger";
import type { Invitation } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

/**
 * Tenant-only → connected mode.
 *
 * The hard part of this screen is not the mechanism, it is the honesty: the
 * tenant is about to give their landlord sight of records that are currently
 * private to them. So it says plainly what the landlord will and will not see
 * before offering the button, rather than after.
 */
export default function InviteScreen() {
  const { tenancy, repo, invalidate } = useApp();
  const tenancyId = tenancy?.tenancy.id ?? null;

  const { data: invitation, loading } = useAsync<Invitation | null>(
    async () => (tenancyId ? repo.getInvitation(tenancyId) : null),
    [tenancyId],
  );

  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!tenancyId) return;
    setBusy(true);
    try {
      await repo.sendInvitation(tenancyId);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const simulateAccept = async () => {
    if (!tenancyId) return;
    setBusy(true);
    try {
      await repo.acceptInvitation(tenancyId);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  if (loading && !invitation) return <LoadingState />;
  if (!invitation || !tenancy) return null;

  const name = invitation.invitedName;

  return (
    <>
      <Stack.Screen options={{ title: "Invite your landlord" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {invitation.status === "accepted" ? (
          <Card>
            <Pill label="CONNECTED" tone="good" />
            <Text style={styles.acceptedTitle}>{name} is on RentLoop</Text>
            <Text style={styles.body}>
              You now share one record. Repairs you report appear on their side immediately, and the
              rent ledger is the same ledger for both of you — there is no longer a version of
              events each of you keeps separately.
            </Text>
            <Text style={styles.meta}>
              Connected {invitation.acceptedOn ? formatDate(invitation.acceptedOn) : "today"}.
            </Text>
            <Button
              label="Back to the property"
              variant="secondary"
              onPress={() => router.replace("/tenant/property")}
              style={styles.action}
            />
          </Card>
        ) : (
          <>
            <Card>
              <Text style={type.title}>Invite {name}</Text>
              <Text style={styles.body}>
                RentLoop works fine without them — everything you have recorded is yours and stays
                yours. Connecting just means you stop keeping separate versions of the same facts.
              </Text>
            </Card>

            <SectionLabel>What they would see</SectionLabel>
            <Card style={styles.listCard}>
              <Line good>The rent ledger, and payments you record</Line>
              <Line good>Repairs you report, with their photos and history</Line>
              <Line good>Messages in this tenancy</Line>
              <Line good>Move-in and move-out inspections</Line>
            </Card>

            <SectionLabel>What stays private</SectionLabel>
            <Card style={styles.listCard}>
              <Line>Your notes on payments</Line>
              <Line>Your other tenancies, past or present</Line>
              <Line>Anything you have not recorded against this tenancy</Line>
            </Card>

            {invitation.status === "sent" ? (
              <Card style={styles.codeCard}>
                <Pill label="INVITE SENT" tone="warn" />
                <Text style={styles.codeLabel}>Their code</Text>
                <Text style={styles.code}>{invitation.code}</Text>
                <Text style={styles.codeHelp}>
                  {name} enters this in RentLoop after installing it. Sent{" "}
                  {invitation.sentOn ? formatDate(invitation.sentOn) : "today"}.
                </Text>
                <Button
                  label="Simulate them accepting"
                  variant="secondary"
                  onPress={simulateAccept}
                  loading={busy}
                  style={styles.action}
                />
                <Text style={styles.demoNote}>
                  Prototype only — there is no real invite to send, so this stands in for the other
                  side accepting.
                </Text>
              </Card>
            ) : (
              <Button
                label={`Invite ${name}`}
                onPress={send}
                loading={busy}
                style={styles.action}
              />
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Line({ children, good = false }: { children: React.ReactNode; good?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.bullet, good && { color: "#1B5E3F" }]}>{good ? "✓" : "·"}</Text>
      <Text style={styles.lineText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  body: { ...type.body, fontSize: 14, lineHeight: 21, marginTop: space.md },
  meta: { ...type.caption, fontSize: 12, marginTop: space.md },
  acceptedTitle: { ...type.title, fontSize: 19, marginTop: space.md },

  listCard: { paddingVertical: space.md },
  line: { flexDirection: "row", gap: space.md, paddingVertical: space.sm },
  bullet: { fontSize: 14, color: color.textFaint, width: 14 },
  lineText: { flex: 1, fontSize: 14, color: color.text, lineHeight: 20 },

  codeCard: { marginTop: space.xl, alignItems: "flex-start" },
  codeLabel: { ...type.label, marginTop: space.lg },
  code: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 8,
    color: color.accent,
    marginTop: space.xs,
    fontVariant: ["tabular-nums"],
  },
  codeHelp: { ...type.caption, fontSize: 13, marginTop: space.sm, lineHeight: 19 },
  demoNote: { ...type.caption, fontSize: 11.5, marginTop: space.sm, fontStyle: "italic" },

  action: { marginTop: space.lg, alignSelf: "stretch" },
});

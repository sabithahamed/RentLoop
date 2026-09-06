import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";

import { Pill } from "@/components/lifecycle";
import { Button, Card, ErrorState, Field, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import type { TenancySummary } from "@/data/types";
import type { TenantInvite } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

/**
 * The code a landlord gives a tenant.
 *
 * Several can be live at once and each carries a label, because a landlord
 * with an annex and an upstairs unit needs to know which code went to which
 * person — and because a code that has been passed to the wrong person should
 * be withdrawable without disturbing the others.
 */
export default function InviteTenantScreen() {
  const { repo, session, revision, invalidate } = useApp();
  const { tenancyId } = useLocalSearchParams<{ tenancyId?: string }>();

  const {
    data: tenancies,
    loading,
    error,
  } = useAsync<TenancySummary[]>(() => repo.listTenancies(), [revision]);

  const chosen = tenancyId || tenancies?.[0]?.tenancy.id;

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "Invite a tenant" }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <Card>
            <Text style={type.heading}>Sign in to invite a tenant</Text>
            <Text style={styles.body}>
              A code lets someone onto one of your properties, so we need to know which properties
              are yours.
            </Text>
            <Button label="Sign in" onPress={() => router.push("/sign-in")} style={styles.action} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (loading && !tenancies) return <LoadingState label="Loading your properties" />;
  if (error) return <ErrorState message={error} />;

  if (!tenancies || tenancies.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: "Invite a tenant" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <Text style={type.heading}>Add a property first</Text>
            <Text style={styles.body}>
              A code lets someone onto a particular property, so there has to be one to let them
              onto.
            </Text>
            <Button
              label="Add a property"
              onPress={() => router.replace("/create-property")}
              style={styles.action}
            />
          </Card>
        </ScrollView>
      </>
    );
  }

  const property = tenancies.find((t) => t.tenancy.id === chosen) ?? tenancies[0];

  return (
    <>
      <Stack.Screen options={{ title: "Invite a tenant" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {tenancies.length > 1 ? (
          <>
            <SectionLabel>Which property</SectionLabel>
            <View style={styles.chips}>
              {tenancies.map((t) => {
                const selected = t.tenancy.id === property.tenancy.id;
                return (
                  <Pressable
                    key={t.tenancy.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => router.setParams({ tenancyId: t.tenancy.id })}
                    style={[styles.chip, selected && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                      {t.property.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Codes
          key={property.tenancy.id}
          tenancyId={property.tenancy.id}
          propertyLabel={property.property.label}
          onChanged={invalidate}
        />
      </ScrollView>
    </>
  );
}

function Codes({
  tenancyId,
  propertyLabel,
  onChanged,
}: {
  tenancyId: string;
  propertyLabel: string;
  onChanged: () => void;
}) {
  const { repo } = useApp();
  const [refresh, setRefresh] = useState(0);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: invites } = useAsync<TenantInvite[]>(
    () => repo.listTenantInvites(tenancyId),
    [tenancyId, refresh],
  );

  const live = invites?.filter((i) => !i.revoked) ?? [];

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await repo.createTenantInvite(tenancyId, label);
      setLabel("");
      setRefresh((n) => n + 1);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make a code");
    } finally {
      setBusy(false);
    }
  };

  const revoke = (invite: TenantInvite) => {
    Alert.alert(
      "Withdraw this code?",
      "Anyone who has it will no longer be able to ask to join. Tenants already approved are not affected.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Withdraw",
          style: "destructive",
          onPress: async () => {
            await repo.revokeTenantInvite(invite.id);
            setRefresh((n) => n + 1);
            onChanged();
          },
        },
      ],
    );
  };

  return (
    <>
      <Card>
        <Text style={type.heading}>{propertyLabel}</Text>
        <Text style={styles.body}>
          Make a code and give it to your tenant — read it out, or send it however you already talk
          to them. They enter it in the app and you get a request to approve.
        </Text>
      </Card>

      <Field
        label="Who is it for?"
        value={label}
        onChangeText={setLabel}
        placeholder="Sabith — upstairs"
        hint="Optional, and only you see it. Useful when several codes are out."
        style={styles.field}
        error={error}
      />
      <Button label="Make a code" onPress={create} loading={busy} />

      {live.length > 0 ? (
        <>
          <SectionLabel>Live codes</SectionLabel>
          <View style={styles.list}>
            {live.map((invite) => (
              <Card key={invite.id} style={styles.codeCard}>
                <View style={styles.codeRow}>
                  <Text style={styles.code}>{invite.code}</Text>
                  <Pill label="NOT USED YET" tone="neutral" />
                </View>
                {invite.label ? <Text style={styles.codeLabel}>For {invite.label}</Text> : null}
                <Button
                  label="Withdraw"
                  variant="ghost"
                  onPress={() => revoke(invite)}
                  style={styles.revoke}
                />
              </Card>
            ))}
          </View>
        </>
      ) : null}

      <Button
        label="See who has asked to join"
        variant="secondary"
        onPress={() => router.push("/approvals")}
        style={styles.action}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  body: { ...type.caption, fontSize: 13, lineHeight: 20, marginTop: space.sm },
  action: { marginTop: space.xl },
  field: { marginTop: space.xl },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.accentSoft, borderColor: color.accentBorder },
  chipText: { fontSize: 13, color: color.textMuted, fontWeight: "500" },
  chipTextOn: { color: color.accent, fontWeight: "600" },

  list: { gap: space.md },
  codeCard: { paddingVertical: space.md },
  codeRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  code: { fontSize: 26, fontWeight: "700", letterSpacing: 4, color: color.text },
  codeLabel: { ...type.caption, fontSize: 13, marginTop: space.xs },
  revoke: { marginTop: space.sm, alignSelf: "flex-start" },
});

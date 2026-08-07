import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NavRow, Pill } from "@/components/lifecycle";
import { Button, Card, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate } from "@/data/ledger";
import type { TenancySummary } from "@/data/types";
import { color, space, type } from "@/theme";

export default function TenantMore() {
  const { session, repo, role, setRole, signOut, useDemoData } = useApp();
  const insets = useSafeAreaInsets();

  const { data: tenancies } = useAsync<TenancySummary[]>(() => repo.listTenancies(), []);
  const past = tenancies?.filter((t) => t.tenancy.status === "ended") ?? [];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
      ]}
    >
      <Text style={type.title}>More</Text>

      <Card style={styles.account}>
        <Text style={type.heading}>{session?.displayName}</Text>
        <Text style={type.caption}>{session?.email}</Text>
      </Card>

      <SectionLabel>Your tenancy</SectionLabel>
      <View style={styles.rows}>
        <NavRow
          title="Reminders"
          subtitle="Everything the app thinks needs your attention"
          onPress={() => router.push("/reminders")}
        />
        <NavRow
          title="Renewal and notice"
          subtitle="Stay on, or give notice"
          onPress={() => router.push("/renewal")}
        />
      </View>

      <SectionLabel>Explore</SectionLabel>
      <View style={styles.rows}>
        <NavRow
          title="Find a place"
          subtitle="Listings that show the landlord's track record"
          onPress={() => router.push("/discover")}
        />
        <NavRow
          title="Reviews"
          subtitle="Written after a tenancy ends, by both sides"
          onPress={() => router.push("/reviews")}
        />
      </View>

      {past.length > 0 ? (
        <>
          <SectionLabel>Previous tenancies</SectionLabel>
          <View style={styles.rows}>
            {past.map((summary) => (
              <NavRow
                key={summary.tenancy.id}
                title={summary.property.label}
                subtitle={`Ended ${formatDate(summary.tenancy.ended_on!)} · deposit not settled`}
                tone="attention"
                onPress={() => router.push(`/deposit?tenancyId=${summary.tenancy.id}`)}
              />
            ))}
          </View>
        </>
      ) : null}

      {/* Prototype scaffolding — clearly separated from the real app. */}
      <SectionLabel>Prototype controls</SectionLabel>
      <Card>
        <Text style={type.heading}>Viewing as {role === "tenant" ? "tenant" : "landlord"}</Text>
        <Text style={styles.roleNote}>
          RentLoop is double-sided. Switch to see the landlord side — a separate persona with its
          own three properties, not {`this account's`} landlord.
        </Text>
        <View style={styles.roleRow}>
          <Pill label="DEMO ONLY" tone="warn" />
        </View>
        <Button
          label="Switch to the landlord view"
          variant="secondary"
          onPress={() => {
            setRole("landlord");
            router.replace("/landlord/portfolio");
          }}
          style={styles.roleButton}
        />
        <Button label="Reset the demo data" variant="ghost" onPress={() => void useDemoData()} />
      </Card>

      <Button
        label="Sign out"
        variant="danger"
        onPress={() => signOut().then(() => router.replace("/sign-in"))}
        style={styles.signOut}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl },
  account: { marginTop: space.lg },
  rows: { gap: space.sm },
  roleNote: { ...type.caption, fontSize: 13, marginTop: space.sm, lineHeight: 19 },
  roleRow: { marginTop: space.md },
  roleButton: { marginTop: space.md, marginBottom: space.sm },
  signOut: { marginTop: space.xxl },
});

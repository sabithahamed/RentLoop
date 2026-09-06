import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { Button, Card, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import type { TenancySummary } from "@/data/types";
import { color, space, type } from "@/theme";

/**
 * Where a new landlord starts.
 *
 * Two jobs, and they are not the same one. A property that is already let
 * needs the tenant brought onto it; a property that is empty needs advertising.
 * Most landlords arrive with both, so neither is buried behind the other.
 */
export default function LandlordOnboarding() {
  const { repo, revision } = useApp();

  const { data: tenancies } = useAsync<TenancySummary[]>(() => repo.listTenancies(), [revision]);
  const hasProperties = (tenancies?.length ?? 0) > 0;

  return (
    <>
      <Stack.Screen options={{ title: "Your properties" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={type.title}>Let us get your properties in</Text>
        <Text style={styles.sub}>
          Add the ones you already let first — that is where the rent tracking and the repair
          history live. Advertising an empty one is a separate thing.
        </Text>

        <SectionLabel>Already let</SectionLabel>
        <Card>
          <Text style={type.heading}>Add a property you rent out</Text>
          <Text style={styles.body}>
            The address, the rent and when it is due. Once it is in, you get a code to give your
            tenant — they ask to join, and you approve it. From then on you are both looking at one
            record instead of two versions of it.
          </Text>
          <Button
            label="Add a property"
            onPress={() => router.push("/create-property")}
            style={styles.action}
          />
        </Card>

        <SectionLabel>Empty, and looking for a tenant</SectionLabel>
        <Card>
          <Text style={type.heading}>Post a place to let</Text>
          <Text style={styles.body}>
            Your listing carries the tenancies you have completed on RentLoop — the part a tenant
            cannot check anywhere else. You will have none at first, and it will say so honestly.
          </Text>
          <Button
            label="Post a place"
            variant="secondary"
            onPress={() => router.push("/listing/edit")}
            style={styles.action}
          />
        </Card>

        <View style={styles.skip}>
          <Button
            label={hasProperties ? "Go to my properties" : "Skip for now"}
            variant="ghost"
            onPress={() => router.replace("/landlord/portfolio")}
          />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  sub: { ...type.bodyMuted, fontSize: 14, lineHeight: 21, marginTop: space.sm },
  body: { ...type.caption, fontSize: 13, lineHeight: 20, marginTop: space.sm },
  action: { marginTop: space.lg },
  skip: { marginTop: space.xl },
});

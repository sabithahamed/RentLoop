import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { Button, Card, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import type { JoinRequest } from "@/data/lifecycleTypes";
import { color, space, type } from "@/theme";

/**
 * Where a new tenant starts.
 *
 * Two genuinely different situations, and conflating them is the mistake most
 * rental apps make. Either the landlord is already on RentLoop and the tenant
 * is joining a record that exists — in which case there is nothing to type in,
 * only a code — or the landlord has never heard of it, and the tenant is
 * keeping the record alone. The second is the common case in Sri Lanka today,
 * and it has to work without the landlord ever signing up.
 */
export default function TenantOnboarding() {
  const { repo, revision } = useApp();

  // Somebody who already asked should see that, not be asked to ask again.
  const { data: requests } = useAsync<JoinRequest[]>(() => repo.listMyJoinRequests(), [revision]);
  const pending = requests?.find((r) => r.status === "pending");

  return (
    <>
      <Stack.Screen options={{ title: "Your tenancy" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={type.title}>How does your rent work?</Text>
        <Text style={styles.sub}>
          Either way you end up with the same record. This only changes who else can see it.
        </Text>

        {pending ? (
          <Card style={styles.pending}>
            <Text style={type.heading}>Waiting on {pending.propertyLabel}</Text>
            <Text style={styles.body}>
              You have asked to join. Your landlord has to approve it before you can see the
              property — we will show it here the moment they do.
            </Text>
          </Card>
        ) : null}

        <SectionLabel>Pick one</SectionLabel>

        <Card>
          <Text style={type.heading}>My landlord uses RentLoop</Text>
          <Text style={styles.body}>
            They will have given you a six-character code. Entering it asks to be added to the
            property they already set up — rent, dates and all — so nothing has to be typed twice.
            They approve the request before you are let in.
          </Text>
          <Button
            label="Enter my landlord's code"
            onPress={() => router.push("/join-property")}
            style={styles.action}
          />
        </Card>

        <Card style={styles.second}>
          <Text style={type.heading}>I will set it up myself</Text>
          <Text style={styles.body}>
            Your landlord does not need an account, and does not need to know. You record the
            property, the rent and what you pay, and it is yours — private until you choose to
            invite them in.
          </Text>
          <Button
            label="Set up my tenancy"
            variant="secondary"
            onPress={() => router.push("/create-tenancy")}
            style={styles.action}
          />
        </Card>

        <View style={styles.skip}>
          <Button
            label="Just looking for a place first"
            variant="ghost"
            onPress={() => router.replace("/discover")}
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
  second: { marginTop: space.md },
  pending: { marginTop: space.xl, borderColor: color.accentBorder },
  skip: { marginTop: space.xl },
});

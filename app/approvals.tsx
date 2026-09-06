import React, { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { Pill } from "@/components/lifecycle";
import { Button, Card, ErrorState, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate } from "@/data/ledger";
import type { JoinRequest } from "@/data/lifecycleTypes";
import { color, space, type } from "@/theme";

/**
 * Who has asked to join a property, and the decision.
 *
 * This is the gate. A code on its own gets somebody as far as this screen and
 * no further — approving is what creates the membership and opens the ledger,
 * the repairs and the inspections to them. Declining shares nothing and keeps
 * nothing.
 */
export default function ApprovalsScreen() {
  const { repo, session, revision, invalidate } = useApp();
  const [refresh, setRefresh] = useState(0);

  const {
    data: requests,
    loading,
    error,
  } = useAsync<JoinRequest[]>(() => repo.listJoinRequests(), [revision, refresh]);

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "Requests" }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <Card>
            <Text style={type.heading}>Sign in to see your requests</Text>
            <Text style={styles.body}>
              Requests to join a property are attached to your account, so we need to know whose
              properties to look at.
            </Text>
            <Button label="Sign in" onPress={() => router.push("/sign-in")} style={styles.action} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (loading && !requests) return <LoadingState label="Loading requests" />;
  if (error) return <ErrorState message={error} />;

  const pending = requests?.filter((r) => r.status === "pending") ?? [];
  const decided = requests?.filter((r) => r.status !== "pending") ?? [];

  const decide = (request: JoinRequest, approve: boolean) => {
    const run = async () => {
      try {
        await repo.decideJoinRequest(request.id, approve);
        setRefresh((n) => n + 1);
        invalidate();
      } catch (e) {
        Alert.alert("That did not work", e instanceof Error ? e.message : "Try again");
      }
    };

    if (approve) {
      Alert.alert(
        `Let ${request.fromName ?? "them"} in?`,
        `They will see the rent ledger, repairs and inspections for ${request.propertyLabel}.`,
        [
          { text: "Not yet", style: "cancel" },
          { text: "Approve", onPress: run },
        ],
      );
    } else {
      Alert.alert(
        `Decline ${request.fromName ?? "this request"}?`,
        "Nothing is shared with them. They can ask again if you give them another code.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Decline", style: "destructive", onPress: run },
        ],
      );
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Requests" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {pending.length === 0 && decided.length === 0 ? (
          <Card>
            <Text style={type.heading}>Nobody is waiting</Text>
            <Text style={styles.body}>
              When a tenant enters one of your codes, their request lands here for you to approve.
            </Text>
            <Button
              label="Make a code for a tenant"
              onPress={() => router.push("/invite-tenant")}
              style={styles.action}
            />
          </Card>
        ) : null}

        {pending.length > 0 ? (
          <>
            <SectionLabel>{pending.length} waiting on you</SectionLabel>
            <View style={styles.list}>
              {pending.map((request) => (
                <Card key={request.id}>
                  <View style={styles.head}>
                    <Text style={styles.name}>{request.fromName ?? "Someone"}</Text>
                    <Text style={styles.date}>{formatDate(request.requestedAt.slice(0, 10))}</Text>
                  </View>
                  <Text style={styles.property}>wants to join {request.propertyLabel}</Text>

                  {request.message ? (
                    <Text style={styles.message}>&ldquo;{request.message}&rdquo;</Text>
                  ) : null}

                  {request.fromPhone ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${request.fromName ?? "them"}`}
                      onPress={() => Linking.openURL(`tel:${request.fromPhone}`)}
                    >
                      <Text style={styles.call}>Call {request.fromPhone} to check</Text>
                    </Pressable>
                  ) : null}

                  <View style={styles.actions}>
                    <Button
                      label="Approve"
                      onPress={() => decide(request, true)}
                      style={styles.half}
                    />
                    <Button
                      label="Decline"
                      variant="ghost"
                      onPress={() => decide(request, false)}
                      style={styles.half}
                    />
                  </View>
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {decided.length > 0 ? (
          <>
            <SectionLabel>Already decided</SectionLabel>
            <View style={styles.list}>
              {decided.map((request) => (
                <Card key={request.id} style={styles.decided}>
                  <View style={styles.head}>
                    <Text style={styles.name}>{request.fromName ?? "Someone"}</Text>
                    <Pill
                      label={request.status === "approved" ? "APPROVED" : "DECLINED"}
                      tone={request.status === "approved" ? "good" : "neutral"}
                    />
                  </View>
                  <Text style={styles.property}>{request.propertyLabel}</Text>
                </Card>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  body: { ...type.body, fontSize: 14, lineHeight: 21, marginTop: space.sm },
  action: { marginTop: space.lg },

  list: { gap: space.md },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { ...type.heading, fontSize: 16 },
  date: { ...type.caption, fontSize: 12 },
  property: { ...type.caption, fontSize: 13, marginTop: 2 },
  message: {
    ...type.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: space.md,
    fontStyle: "italic",
    color: color.textMuted,
  },
  call: { fontSize: 13, fontWeight: "600", color: color.accent, marginTop: space.md },

  actions: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  half: { flex: 1 },
  decided: { opacity: 0.8 },
});

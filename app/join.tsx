import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { Pill } from "@/components/lifecycle";
import { Button, Card, Field, SectionLabel } from "@/components/ui";
import { useApp } from "@/data/store";
import { color, space, type } from "@/theme";

/**
 * The other side of the invite.
 *
 * A landlord who has been given a code lands here. Until they redeem it they
 * have no access to the tenancy at all — which is why the code is checked
 * server-side rather than by looking the invitation up first.
 */
export default function JoinScreen() {
  const { repo, session, setRole, invalidate } = useApp();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);

  /**
   * There are two kinds of code now, and the person holding one has no reason
   * to know which they were given. A tenant-issued code adds a landlord to the
   * tenant's record immediately — the tenant knowingly handed it over, so
   * there is nobody left to ask. A landlord-issued code only raises a request,
   * because codes get forwarded and the landlord has to confirm who turned up.
   *
   * So both are tried against the same box. The landlord-issued path goes
   * first: far more people hold one of those than the other.
   */
  const submit = async () => {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setError("Enter the six-character code you were given");
      return;
    }
    if (!session) {
      setError("Sign in first — a code attaches the property to your account.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const asked = await repo.requestToJoin(trimmed, "");
      setRequested(asked.propertyLabel);
      setRole("tenant");
      invalidate();
      setBusy(false);
      return;
    } catch {
      // Not a landlord's code. Fall through and try the other kind.
    }

    try {
      const result = await repo.redeemInvitation(trimmed);
      setJoined(result.propertyLabel);
      // They joined as a landlord, so show them the landlord side.
      setRole("landlord");
      invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code is not valid, or it has been used");
    } finally {
      setBusy(false);
    }
  };

  if (requested) {
    return (
      <>
        <Stack.Screen options={{ title: "Request sent" }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <Card>
            <Pill label="WAITING FOR APPROVAL" tone="warn" />
            <Text style={styles.joinedTitle}>You have asked to join {requested}</Text>
            <Text style={styles.body}>
              That was a landlord&apos;s code, so your landlord has to approve the request before
              you can see the property. Nothing is shared either way until they do.
            </Text>
            <Button
              label="Done"
              onPress={() => router.replace("/tenant/home")}
              style={styles.action}
            />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (joined) {
    return (
      <>
        <Stack.Screen options={{ title: "Joined" }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <Card>
            <Pill label="CONNECTED" tone="good" />
            <Text style={styles.joinedTitle}>You are now on {joined}</Text>
            <Text style={styles.body}>
              You and your tenant are looking at the same records from here on. Rent they record,
              repairs they report and the evidence either of you captures is one shared history, not
              two versions of it.
            </Text>
            <Button
              label="Go to my properties"
              onPress={() => router.replace("/landlord/portfolio")}
              style={styles.action}
            />
          </Card>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Join a tenancy" }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={type.title}>Got a code?</Text>
            <Text style={styles.body}>
              From your tenant or your landlord — either works here. A tenant&apos;s code joins you
              to the record they have been keeping. A landlord&apos;s code asks to be added to the
              property they set up, and they approve it.
            </Text>
          </Card>

          <Field
            label="Your code"
            required
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            placeholder="ABC123"
            error={error}
            style={styles.codeField}
          />

          <Button label="Join the tenancy" onPress={submit} loading={busy} />

          <SectionLabel>What you will be able to see</SectionLabel>
          <Card style={styles.listCard}>
            <Line>The rent ledger, and every payment recorded against it</Line>
            <Line>Repairs, with their photos and full history</Line>
            <Line>Messages on this tenancy</Line>
            <Line>Move-in and move-out inspections</Line>
          </Card>

          <Text style={styles.footnote}>
            You will not see anything from your tenant&apos;s other tenancies, or any private notes
            they have kept for themselves.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.line}>
      <Text style={styles.tick}>✓</Text>
      <Text style={styles.lineText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  body: { ...type.body, fontSize: 14, lineHeight: 21, marginTop: space.md },
  joinedTitle: { ...type.title, fontSize: 19, marginTop: space.md },
  action: { marginTop: space.xl },

  codeField: { marginTop: space.xl },

  listCard: { paddingVertical: space.md },
  line: { flexDirection: "row", gap: space.md, paddingVertical: space.sm },
  tick: { fontSize: 14, color: color.success, width: 14 },
  lineText: { flex: 1, fontSize: 14, color: color.text, lineHeight: 20 },

  footnote: { ...type.caption, fontSize: 12, marginTop: space.xl, lineHeight: 18 },
});

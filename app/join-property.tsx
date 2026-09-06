import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { Pill } from "@/components/lifecycle";
import { Button, Card, Field, SectionLabel } from "@/components/ui";
import { useApp } from "@/data/store";
import { color, space, type } from "@/theme";

/**
 * A tenant asking to be let onto a property their landlord already set up.
 *
 * The mirror of `/join`, which is a landlord redeeming a code their tenant
 * issued. The difference is what happens next: a tenant-issued code grants
 * access immediately, because the tenant knowingly handed it over, whereas
 * this one only raises a request. Codes get forwarded, screenshotted and
 * passed around — the landlord is the one who knows whether the person holding
 * it is the person they meant to give it to.
 */
export default function JoinPropertyScreen() {
  const { repo, session, setRole, invalidate } = useApp();

  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<{ property: string; landlord: string } | null>(null);

  const submit = async () => {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setError("Enter the six-character code your landlord gave you");
      return;
    }
    if (!session) {
      setError("Sign in first — joining a property attaches it to your account.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await repo.requestToJoin(trimmed, message);
      setAsked({ property: result.propertyLabel, landlord: result.landlordName });
      setRole("tenant");
      invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that request");
    } finally {
      setBusy(false);
    }
  };

  if (asked) {
    return (
      <>
        <Stack.Screen options={{ title: "Request sent" }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <Card>
            <Pill label="WAITING FOR APPROVAL" tone="warn" />
            <Text style={styles.title}>You have asked to join {asked.property}</Text>
            <Text style={styles.body}>
              {asked.landlord} has to approve it before you can see the property. Nothing is shared
              with you until they do, and nothing of yours is shared with them either.
            </Text>
            <Text style={styles.body}>
              If they are sitting next to you, they can approve it right now from their Requests
              screen.
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

  return (
    <>
      <Stack.Screen options={{ title: "Join a property" }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={type.title}>Got a code from your landlord?</Text>
            <Text style={styles.body}>
              They have already put the property in — the rent, the due date, the address. Entering
              their code asks to be added to it, so you do not have to type any of that yourself.
            </Text>
          </Card>

          <Field
            label="Property code"
            required
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            placeholder="ABC123"
            style={styles.codeField}
          />

          <Field
            label="Anything to tell them?"
            value={message}
            onChangeText={setMessage}
            multiline
            placeholder="It's Sabith — moving in on the 1st."
            hint="Optional. Shown beside your name when they approve."
            error={error}
          />

          <Button label="Ask to join" onPress={submit} loading={busy} />

          <SectionLabel>What happens then</SectionLabel>
          <Card style={styles.listCard}>
            <Line>Your landlord sees your name and number, and approves or declines</Line>
            <Line>Approved, you both see one shared record of the tenancy</Line>
            <Line>Declined, nothing is shared and nothing is kept</Line>
          </Card>

          <Text style={styles.footnote}>
            No code? You can set the tenancy up yourself instead — your landlord never needs an
            account.
          </Text>
          <Button
            label="Set it up myself"
            variant="ghost"
            onPress={() => router.replace("/create-tenancy")}
          />
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
  title: { ...type.title, fontSize: 19, marginTop: space.md },
  body: { ...type.body, fontSize: 14, lineHeight: 21, marginTop: space.md },
  action: { marginTop: space.xl },

  codeField: { marginTop: space.xl },

  listCard: { paddingVertical: space.md },
  line: { flexDirection: "row", gap: space.md, paddingVertical: space.sm },
  tick: { fontSize: 14, color: color.success, width: 14 },
  lineText: { flex: 1, fontSize: 14, color: color.text, lineHeight: 20 },

  footnote: { ...type.caption, fontSize: 12, marginTop: space.xl, lineHeight: 18 },
});

import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { router } from "expo-router";

import { Button, Field } from "@/components/ui";
import { useApp } from "@/data/store";
import { color, space, type } from "@/theme";

export default function SignUpScreen() {
  const { signUp } = useApp();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!displayName.trim()) return setError("Enter your name");
    if (!email.trim()) return setError("Enter your email");
    if (password.length < 8) return setError("Use at least 8 characters");

    setBusy(true);
    setError(null);
    try {
      await signUp({ email, password, displayName });
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create your account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[type.title, styles.heading]}>Set up your account</Text>
        <Text style={[type.bodyMuted, styles.sub]}>
          Next you will add your tenancy — the property, your landlord, and what rent is due.
        </Text>

        <Field
          label="Your name"
          required
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Sabith"
          autoComplete="name"
        />
        <Field
          label="Email"
          required
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          required
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="At least 8 characters"
          error={error}
        />

        <Button label="Create account" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xxl },
  heading: { marginBottom: space.sm },
  sub: { marginBottom: space.xxl, fontSize: 14 },
});

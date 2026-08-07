import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Field } from "@/components/ui";
import { useApp } from "@/data/store";
import { DEMO_EMAIL } from "@/data/mock/seed";
import { color, space, type } from "@/theme";

export default function SignInScreen() {
  const { signIn, useDemoData } = useApp();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState("demo1234");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim()) {
      setError("Enter your email");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    await useDemoData();
    setBusy(false);
    router.replace("/");
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Text style={styles.markText}>R</Text>
          </View>
          <Text style={styles.wordmark}>RentLoop</Text>
          <Text style={[type.bodyMuted, styles.tagline]}>
            Every rent payment, recorded and provable.
          </Text>
        </View>

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
          placeholder="••••••••"
          error={error}
        />

        <Button label="Sign in" onPress={submit} loading={busy} />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Button label="Open the demo ledger" variant="secondary" onPress={demo} disabled={busy} />

        <Text style={styles.demoHint}>
          The demo has six months of history already recorded, including a part-paid month and an
          overdue one.
        </Text>

        <View style={styles.footer}>
          <Text style={type.caption}>New to RentLoop?</Text>
          <Button
            label="Create an account"
            variant="ghost"
            onPress={() => router.push("/sign-up")}
            style={styles.footerButton}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xxl },
  brand: { alignItems: "center", marginBottom: space.xxxl },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { color: color.textInverse, fontSize: 28, fontWeight: "700" },
  wordmark: { ...type.title, fontSize: 26, marginTop: space.md },
  tagline: { marginTop: space.sm, textAlign: "center", fontSize: 14 },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginVertical: space.xl,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: color.borderStrong },
  dividerText: { ...type.caption, fontSize: 12 },

  demoHint: { ...type.caption, fontSize: 12, marginTop: space.md, textAlign: "center" },

  footer: { alignItems: "center", marginTop: space.xxxl },
  footerButton: { height: 40, marginTop: space.xs },
});

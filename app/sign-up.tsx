import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { Button, Field } from "@/components/ui";
import { useApp } from "@/data/store";
import type { Role } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

/**
 * Creating an account, and saying which side of a tenancy you are on.
 *
 * The role is asked here rather than inferred later because the two setups
 * genuinely diverge: a tenant is joining a property or recording one their
 * landlord knows nothing about, and a landlord is putting properties up and
 * letting tenants in. Guessing that from behaviour would mean showing everyone
 * both, which is how prototypes end up with a menu instead of a product.
 *
 * It is not a life sentence. Plenty of people rent one place and let another,
 * and the view can be switched afterwards.
 */
export default function SignUpScreen() {
  const { signUp } = useApp();

  const [role, setRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!role) return setError("Choose whether you are renting or letting");
    if (!displayName.trim()) return setError("Enter your name");
    if (!email.trim()) return setError("Enter your email");
    if (password.length < 8) return setError("Use at least 8 characters");

    setBusy(true);
    setError(null);
    try {
      await signUp({ email, password, displayName, role });
      router.replace(role === "landlord" ? "/onboarding/landlord" : "/onboarding/tenant");
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
          Which of these are you? It decides what you see next, and you can change it later.
        </Text>

        <RoleChoice
          selected={role === "tenant"}
          title="I am renting a place"
          body="Keep a record of the rent you pay, report repairs, and hold on to the evidence that gets your deposit back."
          onPress={() => setRole("tenant")}
        />
        <RoleChoice
          selected={role === "landlord"}
          title="I am letting a place"
          body="Put properties up, invite your tenants onto them, and see who has paid without chasing anybody."
          onPress={() => setRole("landlord")}
        />

        <View style={styles.fields}>
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
        </View>

        <Button label="Create account" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RoleChoice({
  selected,
  title,
  body,
  onPress,
}: {
  selected: boolean;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceOn]}
    >
      <View style={styles.choiceHead}>
        <View style={[styles.radio, selected && styles.radioOn]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
        <Text style={[styles.choiceTitle, selected && styles.choiceTitleOn]}>{title}</Text>
      </View>
      <Text style={styles.choiceBody}>{body}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xxl, paddingBottom: space.xxxl * 2 },
  heading: { marginBottom: space.sm },
  sub: { marginBottom: space.xl, fontSize: 14 },

  choice: {
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    marginBottom: space.md,
  },
  choiceOn: { borderColor: color.accentBorder, backgroundColor: color.accentSoft },
  choiceHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: color.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.accent },
  choiceTitle: { ...type.heading, fontSize: 15, flex: 1 },
  choiceTitleOn: { color: color.accent },
  choiceBody: { ...type.caption, fontSize: 13, lineHeight: 19, marginTop: space.sm },

  fields: { marginTop: space.xl },
});

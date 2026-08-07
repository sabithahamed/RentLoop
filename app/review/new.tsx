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
import { Stack, router, useLocalSearchParams } from "expo-router";

import { Pill } from "@/components/lifecycle";
import { Button, Card, Field, LoadingState } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate } from "@/data/ledger";
import type { TenancySummary } from "@/data/types";
import { color, radius, space, type } from "@/theme";

const RATING_WORDS = ["", "Bad", "Poor", "Fair", "Good", "Excellent"];

/**
 * Writing a review, which is only possible after a tenancy RentLoop saw end.
 *
 * The prompt asks about specific, checkable things — repairs, deposit, contact
 * — rather than inviting a general verdict. Reviews that describe behaviour are
 * useful to the next tenant; reviews that describe feelings are not.
 */
export default function NewReviewScreen() {
  const { tenancyId } = useLocalSearchParams<{ tenancyId?: string }>();
  const { repo, role, invalidate } = useApp();

  const { data: tenancies, loading } = useAsync<TenancySummary[]>(() => repo.listTenancies(), []);

  const ended = tenancies?.filter((t) => t.tenancy.status === "ended") ?? [];
  const target = tenancyId
    ? (ended.find((t) => t.tenancy.id === tenancyId) ?? null)
    : (ended[0] ?? null);

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!target) return;
    if (rating === 0) {
      setError("Pick a rating");
      return;
    }
    if (body.trim().length < 20) {
      setError("Write a couple of sentences — a bare rating helps nobody");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await repo.leaveReview({
        tenancyId: target.tenancy.id,
        direction: role === "tenant" ? "tenant_to_landlord" : "landlord_to_tenant",
        rating,
        body: body.trim(),
      });
      invalidate();
      router.replace("/reviews");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your review");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !tenancies) return <LoadingState />;

  if (!target) {
    return (
      <>
        <Stack.Screen options={{ title: "Write a review" }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <Card>
            <Text style={type.heading}>Nothing to review yet</Text>
            <Text style={styles.emptyText}>
              Reviews open when a tenancy ends. That constraint is the point — it is what stops this
              becoming a place anyone can complain about anyone.
            </Text>
          </Card>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Write a review" }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <Pill label="VERIFIED TENANCY" tone="good" />
            <Text style={styles.subject}>{target.property.label}</Text>
            <Text style={type.caption}>
              {role === "tenant" ? target.landlord.full_name : "Your tenant"} ·{" "}
              {formatDate(target.tenancy.started_on)} to{" "}
              {target.tenancy.ended_on ? formatDate(target.tenancy.ended_on) : "now"}
            </Text>
          </Card>

          <Text style={styles.question}>
            How was {role === "tenant" ? "renting from them" : "renting to them"}?
          </Text>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: rating === value }}
                accessibilityLabel={`${value} of 5`}
                onPress={() => setRating(value)}
                hitSlop={6}
              >
                <Text style={[styles.star, value <= rating && styles.starOn]}>
                  {value <= rating ? "★" : "☆"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.ratingWord}>{rating > 0 ? RATING_WORDS[rating] : " "}</Text>

          <Field
            label="What should the next person know?"
            value={body}
            onChangeText={setBody}
            multiline
            placeholder={
              role === "tenant"
                ? "Were repairs dealt with? Was the deposit returned fairly? Were they easy to reach?"
                : "Was rent paid on time? Was the property looked after? Were issues raised early?"
            }
            error={error}
            style={styles.field}
          />

          <Text style={styles.guidance}>
            Stick to what happened. This is attached to a tenancy RentLoop recorded, so it carries
            more weight than an anonymous review — and it is permanent.
          </Text>

          <Button label="Publish review" onPress={submit} loading={busy} style={styles.submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  emptyText: { ...type.bodyMuted, fontSize: 14, lineHeight: 21, marginTop: space.sm },
  subject: { ...type.title, fontSize: 18, marginTop: space.md },
  question: { ...type.heading, fontSize: 16, marginTop: space.xxl, textAlign: "center" },
  stars: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.sm,
    marginTop: space.lg,
  },
  star: { fontSize: 40, color: color.borderStrong },
  starOn: { color: "#B8860B" },
  ratingWord: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: color.textMuted,
    marginTop: space.sm,
    marginBottom: space.xl,
    minHeight: 20,
  },
  field: { marginTop: space.sm },
  guidance: { ...type.caption, fontSize: 12.5, lineHeight: 18 },
  submit: { marginTop: space.xl },
});

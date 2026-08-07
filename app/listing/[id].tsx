import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { Pill, Stars } from "@/components/lifecycle";
import { Button, Card, ErrorState, Field, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatLKR } from "@/data/ledger";
import type { Listing } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

/**
 * A listing, led by the landlord rather than the property.
 *
 * Photos and square footage are what every other listing site already does
 * better. The one thing RentLoop can put here that they cannot is a verified
 * record of how this landlord actually behaved across completed tenancies —
 * so that is the top half of the screen.
 */
export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo } = useApp();

  const { data: listing, loading, error } = useAsync<Listing>(() => repo.getListing(id), [id]);

  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!message.trim()) return;
    setBusy(true);
    try {
      await repo.enquire(id, message.trim());
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !listing) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!listing) return null;

  return (
    <>
      <Stack.Screen options={{ title: "Listing" }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={type.title}>{listing.title}</Text>
            <Text style={[type.caption, styles.location]}>
              {listing.city} · {listing.bedrooms} bedroom{listing.bedrooms === 1 ? "" : "s"}
            </Text>
            <Text style={styles.rent}>{formatLKR(listing.rentCents)}</Text>
            <Text style={type.caption}>per month</Text>
          </Card>

          <SectionLabel>The landlord</SectionLabel>
          <Card>
            <View style={styles.landlordTop}>
              <View style={{ flex: 1 }}>
                <Text style={type.heading}>{listing.landlordName}</Text>
                {listing.landlordRating !== null ? (
                  <View style={styles.ratingRow}>
                    <Stars rating={listing.landlordRating} />
                    <Text style={styles.ratingText}>{listing.landlordRating.toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>
              {listing.verified ? <Pill label="Verified" tone="good" /> : null}
            </View>

            {listing.landlordTenancyCount > 0 ? (
              <Text style={styles.record}>
                {listing.landlordTenancyCount} tenancies completed on RentLoop, start to finish —
                including the deposit being settled. Reviews come from those tenants.
              </Text>
            ) : (
              <View style={styles.noRecord}>
                <Text style={styles.noRecordText}>
                  No RentLoop history yet. That is not a bad sign — it just means nothing here is
                  verified, so the usual caution applies.
                </Text>
              </View>
            )}
          </Card>

          <SectionLabel>Enquire</SectionLabel>
          {sent ? (
            <Card>
              <Pill label="Enquiry sent" tone="good" />
              <Text style={styles.sentText}>
                {listing.landlordName} has your message. If it leads to a tenancy, RentLoop carries
                it from the agreement through to the deposit.
              </Text>
            </Card>
          ) : (
            <>
              <Field
                label="Your message"
                value={message}
                onChangeText={setMessage}
                multiline
                placeholder="When is it available? Is the rent negotiable for a longer lease?"
              />
              <Button
                label="Send enquiry"
                onPress={send}
                loading={busy}
                disabled={!message.trim()}
              />
            </>
          )}

          <Text style={styles.footnote}>
            Photos, availability, viewings and real listings are not built. RentLoop is not trying
            to be a listing site — this exists to show where a tenancy starts.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  location: { marginTop: 2 },
  rent: { ...type.moneyLarge, fontSize: 28, marginTop: space.lg },
  landlordTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs },
  ratingText: { fontSize: 13, color: color.textMuted, fontVariant: ["tabular-nums"] },
  record: { ...type.caption, fontSize: 13.5, lineHeight: 20, marginTop: space.md },
  noRecord: {
    marginTop: space.md,
    backgroundColor: color.surfaceSunken,
    borderRadius: radius.sm,
    padding: space.md,
  },
  noRecordText: { fontSize: 13, color: color.textMuted, lineHeight: 19 },
  sentText: { ...type.body, fontSize: 14, lineHeight: 21, marginTop: space.md },
  footnote: {
    ...type.caption,
    fontSize: 12,
    marginTop: space.xl,
    lineHeight: 18,
    fontStyle: "italic",
  },
});

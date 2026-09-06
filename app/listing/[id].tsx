import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { Pill, Stars } from "@/components/lifecycle";
import { Button, Card, ErrorState, Field, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate, formatLKR } from "@/data/ledger";
import { FURNISHING_LABEL, PROPERTY_TYPE_LABEL, type Listing } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

/**
 * A listing, led by the landlord rather than the property.
 *
 * Photos and floor space are what every other listing site already does. The
 * one thing RentLoop can put here that they cannot is a verified record of how
 * this landlord actually behaved across completed tenancies — so that sits
 * directly under the price, not buried at the bottom.
 */
export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, invalidate, session } = useApp();

  const { data: listing, loading, error } = useAsync<Listing>(() => repo.getListing(id), [id]);

  const [photoIndex, setPhotoIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // A landlord cannot read your profile, so the number has to travel with the
  // enquiry. Prefilled from the account when it is already there, and saved
  // back so it only has to be typed once.
  const [phone, setPhone] = useState("");
  const [phoneLoaded, setPhoneLoaded] = useState(false);

  useEffect(() => {
    if (!session || phoneLoaded) return;
    let live = true;
    repo
      .getContactPhone()
      .then((existing) => {
        if (!live) return;
        if (existing) setPhone(existing);
        setPhoneLoaded(true);
      })
      .catch(() => setPhoneLoaded(true));
    return () => {
      live = false;
    };
  }, [repo, session, phoneLoaded]);

  const send = async () => {
    if (!message.trim()) return;
    if (!session) {
      setSendError(
        "Sign in first — an enquiry has to come from an account so the landlord can reply.",
      );
      return;
    }
    if (!phone.trim()) {
      setSendError("Add a number — the landlord has no other way to reach you.");
      return;
    }
    setBusy(true);
    setSendError(null);
    try {
      // Saved first: the database copies the number onto the enquiry as it is
      // inserted, so an out-of-date profile would send an unreachable one.
      await repo.setContactPhone(phone.trim());
      await repo.enquire(id, message.trim());
      setSent(true);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Could not send your enquiry");
    } finally {
      setBusy(false);
    }
  };

  const toggleSave = async () => {
    if (!listing) return;
    if (!session) {
      setSendError("Sign in to save places to a shortlist.");
      return;
    }
    try {
      await repo.toggleSavedListing(listing.id, !listing.saved);
      invalidate();
    } catch {
      setSendError("Could not save that. Try signing in again.");
    }
  };

  if (loading && !listing) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!listing) return null;

  const width = Dimensions.get("window").width;

  return (
    <>
      <Stack.Screen options={{ title: listing.city }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Gallery */}
          {listing.photos.length > 0 ? (
            <View>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) =>
                  setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / width))
                }
              >
                {listing.photos.map((photo) => (
                  <Image
                    key={photo.id}
                    source={{ uri: photo.url }}
                    style={[styles.hero, { width }]}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>

              <View style={styles.dots}>
                {listing.photos.map((p, i) => (
                  <View key={p.id} style={[styles.dot, i === photoIndex && styles.dotOn]} />
                ))}
              </View>

              {listing.photos[photoIndex]?.caption ? (
                <Text style={styles.caption}>{listing.photos[photoIndex].caption}</Text>
              ) : null}
            </View>
          ) : (
            <View style={[styles.hero, styles.heroEmpty, { width }]}>
              <Text style={type.caption}>No photos yet</Text>
            </View>
          )}

          <View style={styles.pad}>
            <View style={styles.priceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rent}>{formatLKR(listing.rentCents)}</Text>
                <Text style={type.caption}>per month</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={listing.saved ? "Remove from saved" : "Save this place"}
                onPress={toggleSave}
                hitSlop={10}
                style={styles.saveButton}
              >
                <Text style={[styles.saveIcon, listing.saved && styles.saveIconOn]}>
                  {listing.saved ? "♥" : "♡"}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.title}>{listing.title}</Text>
            <Text style={type.caption}>
              {listing.addressLine ? `${listing.addressLine}, ` : ""}
              {listing.city}
            </Text>

            <View style={styles.facts}>
              <Fact
                value={String(listing.bedrooms)}
                label={listing.bedrooms === 1 ? "bedroom" : "bedrooms"}
              />
              <Fact
                value={String(listing.bathrooms)}
                label={listing.bathrooms === 1 ? "bathroom" : "bathrooms"}
              />
              <Fact value={PROPERTY_TYPE_LABEL[listing.propertyType]} label="type" />
            </View>

            <View style={styles.tags}>
              <Pill label={FURNISHING_LABEL[listing.furnished]} tone="neutral" />
              {listing.depositCents ? (
                <Pill label={`${formatLKR(listing.depositCents)} deposit`} tone="neutral" />
              ) : null}
              {listing.availableFrom ? (
                <Pill label={`From ${formatDate(listing.availableFrom)}`} tone="info" />
              ) : null}
            </View>

            {/* The differentiator, above the fold rather than buried. */}
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
                  {listing.landlordTenancyCount} tenanc
                  {listing.landlordTenancyCount === 1 ? "y" : "ies"} completed on RentLoop, start to
                  finish — including the deposit being settled. Any rating comes from those tenants.
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

            <SectionLabel>About this place</SectionLabel>
            <Text style={styles.description}>{listing.description}</Text>

            <SectionLabel>Enquire</SectionLabel>
            {sent ? (
              <Card>
                <Pill label="Enquiry sent" tone="good" />
                <Text style={styles.sentText}>
                  {listing.landlordName} has your message. If it turns into a tenancy, RentLoop
                  carries it from the agreement through to the deposit.
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
                <Field
                  label="Your phone number"
                  required
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="077 123 4567"
                  hint="Sent with this enquiry so the landlord can call you back. Nobody else sees it."
                  error={sendError}
                />
                <Button
                  label="Send enquiry"
                  onPress={send}
                  loading={busy}
                  disabled={!message.trim() || !phone.trim()}
                />
              </>
            )}

            <Text style={styles.footnote}>
              Demonstration listing. The photographs are freely licensed stand-ins credited in
              docs/PHOTO-CREDITS.md, and no property here is really being offered for rent.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { paddingBottom: space.xxxl * 2 },
  pad: { padding: space.xl },

  hero: { height: 260, backgroundColor: color.surfaceSunken },
  heroEmpty: { alignItems: "center", justifyContent: "center" },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingTop: space.md,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.borderStrong },
  dotOn: { backgroundColor: color.accent, width: 18 },
  caption: { ...type.caption, fontSize: 12, textAlign: "center", marginTop: space.sm },

  priceRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  rent: { ...type.moneyLarge, fontSize: 30 },
  saveButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  saveIcon: { fontSize: 22, color: color.textMuted, lineHeight: 26 },
  saveIconOn: { color: "#C2334D" },

  title: { ...type.title, fontSize: 20, marginTop: space.lg },

  facts: {
    flexDirection: "row",
    marginTop: space.xl,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    paddingVertical: space.lg,
  },
  fact: { flex: 1, alignItems: "center" },
  factValue: { fontSize: 17, fontWeight: "700", color: color.text },
  factLabel: { ...type.caption, fontSize: 12, marginTop: 2 },

  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.lg },

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

  description: { ...type.body, lineHeight: 22 },
  sentText: { ...type.body, fontSize: 14, lineHeight: 21, marginTop: space.md },
  footnote: {
    ...type.caption,
    fontSize: 11.5,
    marginTop: space.xxl,
    lineHeight: 17,
    fontStyle: "italic",
  },
});

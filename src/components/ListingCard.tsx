/**
 * One property in the search results.
 *
 * The photo carries the browsing decision, so it gets the space. Everything
 * underneath answers the three questions people actually ask in order: how
 * much, how big, and can I trust this landlord.
 */

import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { color, radius, shadow, space, type } from "../theme";
import { formatLKR } from "../data/ledger";
import { PROPERTY_TYPE_LABEL, type Listing } from "../data/lifecycleTypes";

export function ListingCard({
  listing,
  onPress,
  onToggleSave,
}: {
  listing: Listing;
  onPress: () => void;
  onToggleSave?: () => void;
}) {
  const cover = listing.photos[0];

  // The save control is a sibling of the card press target, not a child of it.
  // Nesting one press target inside another leaves it ambiguous which one a tap
  // meant — and on web it renders a button inside a button, which is invalid
  // HTML and breaks hydration.
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${listing.title}, ${listing.city}, ${formatLKR(listing.rentCents)} per month`}
        onPress={onPress}
        style={({ pressed }) => [styles.press, pressed && styles.pressed]}
      >
        <View style={styles.photoWrap}>
          {cover ? (
            <Image source={{ uri: cover.url }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]}>
              <Text style={styles.photoEmptyText}>No photo</Text>
            </View>
          )}

          {listing.verified ? (
            <View style={styles.verifiedTag}>
              <Text style={styles.verifiedText}>✓ VERIFIED LANDLORD</Text>
            </View>
          ) : null}

          {listing.photos.length > 1 ? (
            <View style={styles.countTag}>
              <Text style={styles.countText}>{listing.photos.length} photos</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.topLine}>
            <Text style={styles.rent}>{formatLKR(listing.rentCents)}</Text>
            <Text style={styles.perMonth}>/month</Text>
          </View>

          <Text style={styles.title} numberOfLines={1}>
            {listing.title}
          </Text>

          <Text style={styles.meta} numberOfLines={1}>
            {listing.city} · {PROPERTY_TYPE_LABEL[listing.propertyType]} · {listing.bedrooms} bed
            {listing.bedrooms === 1 ? "" : "s"} · {listing.bathrooms} bath
            {listing.bathrooms === 1 ? "" : "s"}
          </Text>

          <View style={styles.landlordRow}>
            {listing.landlordTenancyCount > 0 ? (
              <Text style={styles.record}>
                {listing.landlordRating !== null ? `★ ${listing.landlordRating.toFixed(1)} · ` : ""}
                {listing.landlordTenancyCount} completed tenanc
                {listing.landlordTenancyCount === 1 ? "y" : "ies"}
              </Text>
            ) : (
              <Text style={styles.noRecord}>No RentLoop history yet</Text>
            )}
          </View>
        </View>
      </Pressable>

      {onToggleSave ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listing.saved ? "Remove from saved" : "Save this place"}
          onPress={onToggleSave}
          hitSlop={10}
          style={styles.saveButton}
        >
          <Text style={[styles.saveIcon, listing.saved && styles.saveIconOn]}>
            {listing.saved ? "♥" : "♡"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    overflow: "hidden",
    ...shadow.card,
  },
  // The press target fills the card: everything except the save control is
  // meant to open the listing, including the margins around the text.
  press: { width: "100%" },
  pressed: { opacity: 0.94 },

  photoWrap: { position: "relative", backgroundColor: color.surfaceSunken },
  photo: { width: "100%", aspectRatio: 3 / 2 },
  photoEmpty: { alignItems: "center", justifyContent: "center" },
  photoEmptyText: { ...type.caption, fontSize: 12 },

  verifiedTag: {
    position: "absolute",
    top: space.md,
    left: space.md,
    backgroundColor: "rgba(26, 92, 62, 0.92)",
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  verifiedText: { fontSize: 9.5, fontWeight: "700", letterSpacing: 0.5, color: "#FFFFFF" },

  saveButton: {
    position: "absolute",
    top: space.sm,
    right: space.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  saveIcon: { fontSize: 19, color: color.textMuted, lineHeight: 22 },
  saveIconOn: { color: "#C2334D" },

  countTag: {
    position: "absolute",
    bottom: space.sm,
    right: space.sm,
    backgroundColor: "rgba(18,23,34,0.72)",
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 3,
  },
  countText: { fontSize: 10.5, color: "#FFFFFF", fontWeight: "600" },

  body: { padding: space.lg, gap: 3 },
  topLine: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  rent: { ...type.moneyLarge, fontSize: 22 },
  perMonth: { ...type.caption, fontSize: 13 },
  title: { ...type.heading, fontSize: 15.5, marginTop: 2 },
  meta: { ...type.caption, fontSize: 13 },
  landlordRow: { marginTop: space.sm },
  record: { fontSize: 12.5, color: color.success, fontWeight: "600" },
  noRecord: { fontSize: 12.5, color: color.textFaint },
});

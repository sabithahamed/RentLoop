import React from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { Pill } from "@/components/lifecycle";
import { Button, Card, ErrorState, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatLKR } from "@/data/ledger";
import { PROPERTY_TYPE_LABEL, type Listing } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

/**
 * The landlord's own listings.
 *
 * Separate from `/discover`, which is the tenant looking. Here the questions
 * are different: is it still up, has anyone asked about it, and what did I
 * say the rent was. Taken-down listings stay on this screen — an enquiry
 * outlives the advert it came from, and deleting the row would take the
 * conversation with it.
 */
export default function MyListingsScreen() {
  const { repo, session, revision } = useApp();

  const {
    data: listings,
    loading,
    error,
  } = useAsync<Listing[]>(() => repo.listMyListings(), [revision]);

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "My listings" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <Text style={type.heading}>Sign in to post a place</Text>
            <Text style={styles.body}>
              A listing is attached to your account — that is how your track record ends up on it.
            </Text>
            <Button label="Sign in" onPress={() => router.push("/sign-in")} style={styles.spaced} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (loading && !listings) return <LoadingState label="Loading your listings" />;
  if (error) return <ErrorState message={error} />;

  const live = listings ?? [];

  return (
    <>
      <Stack.Screen options={{ title: "My listings" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {live.length === 0 ? (
          <Card>
            <Text style={type.heading}>Nothing posted yet</Text>
            <Text style={styles.body}>
              Put up a place and tenants searching Nugegoda, Dehiwala or wherever you are will see
              it — along with how many tenancies you have completed here.
            </Text>
            <Button
              label="Post a place"
              onPress={() => router.push("/listing/edit")}
              style={styles.spaced}
            />
          </Card>
        ) : (
          <>
            <Button label="Post another place" onPress={() => router.push("/listing/edit")} />
            <SectionLabel>Your places</SectionLabel>
            <View style={styles.list}>
              {live.map((listing) => (
                <Row key={listing.id} listing={listing} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

function Row({ listing }: { listing: Listing }) {
  const { repo, invalidate } = useApp();
  const cover = listing.photos[0];

  const { data: enquiries } = useAsync(() => repo.listEnquiries(listing.id), [listing.id]);
  const enquiryCount = enquiries?.length ?? 0;

  const takeDown = () => {
    Alert.alert(
      "Take this listing down?",
      "It stops appearing in search. Enquiries you have already received are kept.",
      [
        { text: "Leave it up", style: "cancel" },
        {
          text: "Take down",
          style: "destructive",
          onPress: async () => {
            await repo.setListingActive(listing.id, false);
            invalidate();
          },
        },
      ],
    );
  };

  return (
    <Card style={styles.row}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/listing/${listing.id}`)}
        style={styles.rowTop}
      >
        {cover ? (
          <Image source={{ uri: cover.url }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Text style={styles.thumbEmptyText}>No photo</Text>
          </View>
        )}

        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={2}>
            {listing.title}
          </Text>
          <Text style={styles.meta}>
            {listing.city} · {PROPERTY_TYPE_LABEL[listing.propertyType]} · {listing.bedrooms} bed
          </Text>
          <Text style={styles.rent}>{formatLKR(listing.rentCents)} a month</Text>

          <View style={styles.tags}>
            {listing.verified ? (
              <Pill label="VERIFIED" tone="good" />
            ) : (
              <Pill label="NO TRACK RECORD YET" tone="neutral" />
            )}
            <Text style={styles.photoCount}>
              {listing.photos.length} {listing.photos.length === 1 ? "photo" : "photos"}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.enquiryBar}>
        <Text style={styles.enquiryText}>
          {enquiryCount === 0
            ? "No enquiries yet"
            : `${enquiryCount} ${enquiryCount === 1 ? "enquiry" : "enquiries"}`}
        </Text>
        {enquiryCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/listing/enquiries?id=${listing.id}`)}
          >
            <Text style={styles.link}>Read them</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button
          label="Edit"
          variant="secondary"
          onPress={() => router.push(`/listing/edit?id=${listing.id}`)}
          style={styles.action}
        />
        <Button label="Take down" variant="ghost" onPress={takeDown} style={styles.action} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  body: { ...type.body, fontSize: 14, lineHeight: 21, marginTop: space.sm },
  spaced: { marginTop: space.lg },

  list: { gap: space.md },
  row: { padding: space.md },
  rowTop: { flexDirection: "row", gap: space.md },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: color.surfaceSunken },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  thumbEmptyText: { ...type.caption, fontSize: 11 },
  rowText: { flex: 1 },
  title: { ...type.heading, fontSize: 15 },
  meta: { ...type.caption, fontSize: 12, marginTop: 2 },
  rent: { fontSize: 15, fontWeight: "700", color: color.text, marginTop: space.xs },
  tags: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm },
  photoCount: { ...type.caption, fontSize: 11 },

  enquiryBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  enquiryText: { ...type.caption, fontSize: 13 },
  link: { fontSize: 13, color: color.accent, fontWeight: "600" },

  actions: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  action: { flex: 1 },
});

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';

import { Pill, Stars } from '@/components/lifecycle';
import { Card, LoadingState } from '@/components/ui';
import { useApp, useAsync } from '@/data/store';
import { formatLKR } from '@/data/ledger';
import type { Listing } from '@/data/lifecycleTypes';
import { color, radius, space, type } from '@/theme';

/**
 * Discovery — deliberately the thinnest surface in the app.
 *
 * RentLoop is not a listing site and should not try to win on inventory. The
 * one thing it can show that a listing site cannot is what the landlord was
 * actually like to rent from, so that is what each card leads with.
 */
export default function DiscoverScreen() {
  const { repo } = useApp();
  const { data: listings, loading } = useAsync<Listing[]>(() => repo.listListings(), []);

  return (
    <>
      <Stack.Screen options={{ title: 'Find a place' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Card>
          <Text style={type.heading}>Rent from someone with a record</Text>
          <Text style={styles.intro}>
            These are ordinary listings. The difference is the landlord's history — how many
            tenancies they have completed on RentLoop, and what those tenants said afterwards.
          </Text>
        </Card>

        {loading && !listings ? (
          <View style={styles.loading}>
            <LoadingState />
          </View>
        ) : (
          <View style={styles.list}>
            {listings?.map((listing) => (
              <Pressable
                key={listing.id}
                accessibilityRole="button"
                accessibilityLabel={`${listing.title}, ${listing.city}`}
                onPress={() => router.push(`/listing/${listing.id}`)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{listing.title}</Text>
                    <Text style={styles.location}>
                      {listing.city} · {listing.bedrooms} bed
                    </Text>
                  </View>
                  <Text style={type.money}>{formatLKR(listing.rentCents)}</Text>
                </View>

                <View style={styles.landlord}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.landlordName}>{listing.landlordName}</Text>
                    {listing.landlordRating !== null ? (
                      <View style={styles.ratingRow}>
                        <Stars rating={listing.landlordRating} size={13} />
                        <Text style={styles.ratingText}>
                          {listing.landlordRating.toFixed(1)} · {listing.landlordTenancyCount}{' '}
                          completed tenancies
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.noHistory}>No RentLoop history yet</Text>
                    )}
                  </View>
                  {listing.verified ? <Pill label="Verified" tone="good" /> : null}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.footnote}>
          Search, filters and enquiries are not built. This exists to show where a tenancy begins —
          the rest of the app is what happens after.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  intro: { ...type.caption, fontSize: 13, lineHeight: 19, marginTop: space.sm },
  loading: { height: 200 },
  list: { gap: space.sm },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.lg,
  },
  cardPressed: { backgroundColor: color.surfaceSunken },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  title: { fontSize: 15.5, fontWeight: '600', color: color.text },
  location: { fontSize: 13, color: color.textMuted, marginTop: 2 },
  landlord: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  landlordName: { fontSize: 13.5, fontWeight: '600', color: color.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  ratingText: { fontSize: 12, color: color.textMuted },
  noHistory: { fontSize: 12, color: color.textFaint, marginTop: 2, fontStyle: 'italic' },
  footnote: { ...type.caption, fontSize: 12, marginTop: space.xl, lineHeight: 18, fontStyle: 'italic' },
});

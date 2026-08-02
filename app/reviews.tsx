import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';

import { EmptyNote, Pill, Stars } from '@/components/lifecycle';
import { Button, Card, LoadingState, SectionLabel } from '@/components/ui';
import { useApp, useAsync } from '@/data/store';
import { formatDate } from '@/data/ledger';
import type { Review } from '@/data/lifecycleTypes';
import type { TenancySummary } from '@/data/types';
import { color, radius, space, type } from '@/theme';

/**
 * Reviews, which only exist off a tenancy RentLoop actually recorded.
 *
 * That constraint is the entire value: anyone can leave a review on a listing
 * site, but a review here means the platform saw thirteen months of rent go
 * through. Both directions are shown together — a tenant judging a landlord
 * and a landlord judging a tenant carry the same weight.
 */
export default function ReviewsScreen() {
  const { repo } = useApp();

  const { data: tenancies, loading: loadingTenancies } = useAsync<TenancySummary[]>(
    () => repo.listTenancies(),
    [],
  );
  const ended = tenancies?.filter((t) => t.tenancy.status === 'ended') ?? [];
  const endedId = ended[0]?.tenancy.id ?? null;

  const { data: reviews, loading: loadingReviews } = useAsync<Review[]>(
    async () => (endedId ? repo.listReviews(endedId) : []),
    [endedId],
  );

  // This screen loads in two waves — tenancies, then that tenancy's reviews.
  // Without waiting for both, the gap between them renders the empty state,
  // which tells the user there is nothing to review. That is a false statement,
  // not just a blank screen.
  const loading = loadingTenancies || loadingReviews || (endedId !== null && reviews === null);

  return (
    <>
      <Stack.Screen options={{ title: 'Reviews' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Card>
          <Pill label="VERIFIED TENANCIES ONLY" tone="good" />
          <Text style={styles.intro}>
            A review can only be written after a tenancy that RentLoop recorded from start to
            finish. That is what makes it worth reading.
          </Text>
        </Card>

        {loading ? (
          <View style={styles.loading}>
            <LoadingState />
          </View>
        ) : reviews && reviews.length > 0 ? (
          <>
            <SectionLabel>
              {ended[0]?.property.label ?? 'Previous tenancy'}
            </SectionLabel>
            <View style={styles.list}>
              {reviews.map((review) => (
                <View key={review.id} style={styles.review}>
                  <View style={styles.reviewTop}>
                    <Text style={styles.direction}>
                      {review.direction === 'tenant_to_landlord'
                        ? 'You reviewed your landlord'
                        : 'Your landlord reviewed you'}
                    </Text>
                    <Stars rating={review.rating} />
                  </View>
                  <Text style={styles.body}>{review.body}</Text>
                  <View style={styles.reviewBottom}>
                    <Text style={styles.date}>{formatDate(review.created_at.slice(0, 10))}</Text>
                    {review.verified ? <Pill label="Verified" tone="good" /> : null}
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Card style={styles.empty}>
            <EmptyNote>
              No reviews yet. They become available when a tenancy ends — your current one is still
              running.
            </EmptyNote>
          </Card>
        )}

        {ended.length > 0 ? (
          <Button
            label="Write a review"
            onPress={() => router.push(`/review/new?tenancyId=${ended[0].tenancy.id}`)}
            style={styles.write}
          />
        ) : null}

        <Text style={styles.footnote}>
          What happens when someone leaves a bad review — right of reply, disputes, whether a
          landlord can see it before a tenancy ends — still needs thinking through.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  intro: { ...type.caption, fontSize: 13, lineHeight: 19, marginTop: space.md },
  loading: { height: 160 },
  empty: { marginTop: space.lg },
  list: { gap: space.sm },
  review: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.lg,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  direction: { flex: 1, fontSize: 13, fontWeight: '600', color: color.textMuted },
  body: { ...type.body, fontSize: 14.5, lineHeight: 21, marginTop: space.md },
  reviewBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
  date: { fontSize: 12, color: color.textFaint },
  write: { marginTop: space.xl },
  footnote: { ...type.caption, fontSize: 12, marginTop: space.xl, lineHeight: 18, fontStyle: 'italic' },
});

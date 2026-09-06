import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router } from "expo-router";

import { ListingCard } from "@/components/ListingCard";
import { Card, LoadingState } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatLKR } from "@/data/ledger";
import {
  LISTING_SORT_LABEL,
  PROPERTY_TYPE_LABEL,
  type Listing,
  type ListingFilters,
  type ListingSort,
  type PropertyType,
} from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

const BUDGETS: { label: string; max?: number; min?: number }[] = [
  { label: "Under 25k", max: 25_000_00 },
  { label: "25k–50k", min: 25_000_00, max: 50_000_00 },
  { label: "50k–80k", min: 50_000_00, max: 80_000_00 },
  { label: "80k+", min: 80_000_00 },
];

/**
 * Finding a place.
 *
 * The filters are the ones people actually use — where, how much, how many
 * bedrooms — and nothing else. The column RentLoop can offer that a listings
 * site cannot is "verified landlord": someone this app watched carry a tenancy
 * through to a settled deposit. That is why it gets its own filter.
 */
export default function DiscoverScreen() {
  const { repo, invalidate, session } = useApp();

  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string | undefined>();
  const [budget, setBudget] = useState<number | undefined>();
  const [bedrooms, setBedrooms] = useState<number | undefined>();
  const [propertyType, setPropertyType] = useState<PropertyType | undefined>();
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<ListingSort | undefined>();

  const filters: ListingFilters = {
    query: query.trim() || undefined,
    city,
    bedrooms,
    propertyType,
    verifiedOnly: verifiedOnly || undefined,
    savedOnly: savedOnly || undefined,
    minRentCents: budget !== undefined ? BUDGETS[budget].min : undefined,
    maxRentCents: budget !== undefined ? BUDGETS[budget].max : undefined,
    sort,
  };

  const { data: cities } = useAsync<string[]>(() => repo.listListingCities(), []);
  const { data: listings, loading } = useAsync<Listing[]>(
    () => repo.listListings(filters),
    [query, city, budget, bedrooms, propertyType, verifiedOnly, savedOnly, sort],
  );

  const activeCount =
    [city, budget, bedrooms, propertyType].filter((f) => f !== undefined).length +
    (verifiedOnly ? 1 : 0) +
    (savedOnly ? 1 : 0);

  const clearAll = () => {
    setCity(undefined);
    setBudget(undefined);
    setBedrooms(undefined);
    setPropertyType(undefined);
    setVerifiedOnly(false);
    setSavedOnly(false);
  };

  // Browsing works signed out — that is how anyone finds a place in the first
  // place. Saving needs an account, so say so instead of failing silently.
  const [needsAccount, setNeedsAccount] = useState(false);

  const toggleSave = async (listing: Listing) => {
    if (!session) {
      setNeedsAccount(true);
      return;
    }
    try {
      await repo.toggleSavedListing(listing.id, !listing.saved);
      invalidate();
    } catch {
      setNeedsAccount(true);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Find a place" }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by area, type or description"
          placeholderTextColor={color.textFaint}
          style={styles.search}
          returnKeyType="search"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Chip
            label={
              showFilters ? "Hide filters" : `Filters${activeCount ? ` · ${activeCount}` : ""}`
            }
            active={showFilters || activeCount > 0}
            onPress={() => setShowFilters((s) => !s)}
          />
          <Chip label="Verified" active={verifiedOnly} onPress={() => setVerifiedOnly((v) => !v)} />
          {session ? (
            <Chip label="♥ Saved" active={savedOnly} onPress={() => setSavedOnly((v) => !v)} />
          ) : null}
          {BUDGETS.map((b, i) => (
            <Chip
              key={b.label}
              label={b.label}
              active={budget === i}
              onPress={() => setBudget(budget === i ? undefined : i)}
            />
          ))}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Text style={styles.sortLabel}>Sort</Text>
          {(Object.keys(LISTING_SORT_LABEL) as ListingSort[]).map((key) => (
            <Chip
              key={key}
              label={LISTING_SORT_LABEL[key]}
              active={sort === key}
              onPress={() => setSort(sort === key ? undefined : key)}
            />
          ))}
        </ScrollView>

        {showFilters ? (
          <Card style={styles.filters}>
            <FilterGroup label="City">
              {(cities ?? []).map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={city === c}
                  onPress={() => setCity(city === c ? undefined : c)}
                />
              ))}
            </FilterGroup>

            <FilterGroup label="Bedrooms (at least)">
              {[1, 2, 3].map((n) => (
                <Chip
                  key={n}
                  label={`${n}+`}
                  active={bedrooms === n}
                  onPress={() => setBedrooms(bedrooms === n ? undefined : n)}
                />
              ))}
            </FilterGroup>

            <FilterGroup label="Type">
              {(Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((t) => (
                <Chip
                  key={t}
                  label={PROPERTY_TYPE_LABEL[t]}
                  active={propertyType === t}
                  onPress={() => setPropertyType(propertyType === t ? undefined : t)}
                />
              ))}
            </FilterGroup>

            {activeCount > 0 ? (
              <Pressable accessibilityRole="button" onPress={clearAll} style={styles.clear}>
                <Text style={styles.clearText}>Clear all filters</Text>
              </Pressable>
            ) : null}
          </Card>
        ) : null}

        {needsAccount ? (
          <Card style={styles.needAccount}>
            <Text style={type.heading}>Sign in to save places</Text>
            <Text style={styles.emptyText}>
              Browsing is open to everyone. Saving a shortlist needs an account so it follows you
              between devices.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/sign-in")}
              style={styles.clear}
            >
              <Text style={styles.clearText}>Sign in or create an account</Text>
            </Pressable>
          </Card>
        ) : null}

        <Text style={styles.count}>
          {loading && !listings
            ? "Searching…"
            : `${listings?.length ?? 0} place${listings?.length === 1 ? "" : "s"}`}
          {listings && listings.length > 0
            ? ` · from ${formatLKR(Math.min(...listings.map((l) => l.rentCents)))}`
            : ""}
        </Text>

        {loading && !listings ? (
          <View style={styles.loading}>
            <LoadingState label="Finding places" />
          </View>
        ) : listings && listings.length === 0 ? (
          <Card>
            <Text style={type.heading}>Nothing matches</Text>
            <Text style={styles.emptyText}>
              {savedOnly
                ? "You have not saved any places yet. Tap the heart on one you like."
                : "Try widening the budget, or clearing a filter or two."}
            </Text>
            {activeCount > 0 ? (
              <Pressable accessibilityRole="button" onPress={clearAll} style={styles.clear}>
                <Text style={styles.clearText}>Clear all filters</Text>
              </Pressable>
            ) : null}
          </Card>
        ) : (
          <View style={styles.list}>
            {listings?.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                onPress={() => router.push(`/listing/${listing.id}`)}
                onToggleSave={() => toggleSave(listing)}
              />
            ))}
          </View>
        )}

        {!session ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/sign-up")}
            style={styles.signUpRow}
          >
            <Text style={styles.signUpTitle}>Found somewhere? Make an account</Text>
            <Text style={styles.signUpBody}>
              Browsing needs no account. Saving a place, enquiring, and keeping a record of the rent
              once you move in do — that is the part RentLoop is actually for.
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/listing/mine")}
          style={styles.postRow}
        >
          <Text style={styles.postTitle}>Have a place to let?</Text>
          <Text style={styles.postBody}>
            Post it here. Your listing carries the tenancies you have already completed on RentLoop,
            which is the part a tenant cannot check anywhere else.
          </Text>
        </Pressable>

        <Text style={styles.footnote}>
          RentLoop is not a listings site and does not try to be. What it adds is the
          landlord&apos;s record: places marked verified belong to someone this app watched carry a
          tenancy through to a settled deposit.
        </Text>
      </ScrollView>
    </>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipOn, pressed && { opacity: 0.85 }]}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={type.label}>{label}</Text>
      <View style={styles.groupChips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },

  search: {
    height: 50,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
    fontSize: 15.5,
    color: color.text,
  },

  chipRow: { gap: space.sm, paddingVertical: space.md, paddingRight: space.xl },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: color.accent, borderColor: color.accent },
  chipText: { fontSize: 13, fontWeight: "600", color: color.textMuted },
  chipTextOn: { color: color.textInverse },

  filters: { marginBottom: space.md },
  group: { marginBottom: space.lg },
  groupChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  clear: { paddingVertical: space.sm },
  clearText: { fontSize: 13.5, fontWeight: "600", color: color.accent },

  needAccount: { marginBottom: space.lg },
  count: { ...type.label, marginBottom: space.md },
  loading: { height: 200 },
  list: { gap: space.lg },
  emptyText: { ...type.bodyMuted, fontSize: 14, marginTop: space.sm },
  footnote: { ...type.caption, fontSize: 12, marginTop: space.xxl, lineHeight: 18 },

  postRow: {
    marginTop: space.xxl,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.accentSoft,
    borderWidth: 1,
    borderColor: color.accentBorder,
  },
  sortLabel: {
    ...type.caption,
    fontSize: 12,
    alignSelf: "center",
    marginRight: space.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  signUpRow: {
    marginTop: space.xxl,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  signUpTitle: { ...type.heading, fontSize: 15 },
  signUpBody: { ...type.caption, fontSize: 13, lineHeight: 19, marginTop: space.xs },

  postTitle: { ...type.heading, fontSize: 15, color: color.accent },
  postBody: { ...type.caption, fontSize: 13, lineHeight: 19, marginTop: space.xs },
});

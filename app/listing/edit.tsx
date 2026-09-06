import React, { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { Pill } from "@/components/lifecycle";
import { Button, Card, ErrorState, Field, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatLKR, parseLKRInput } from "@/data/ledger";
import {
  FURNISHING_LABEL,
  PROPERTY_TYPE_LABEL,
  type Furnishing,
  type Listing,
  type PropertyType,
} from "@/data/lifecycleTypes";
import { color, radius, space, statusColor, type } from "@/theme";

/**
 * Posting a place, and editing one already posted.
 *
 * One screen for both because the fields are identical and a landlord
 * correcting a typo should not have to learn a second layout. `?id=` decides
 * which it is.
 *
 * What is deliberately absent: any field for "verified", a star rating, or a
 * count of past tenancies. Those are RentLoop's account of this landlord, and
 * the database writes them from tenancies it actually watched
 * (supabase/006_listing_authoring.sql). A listing form that let you type your
 * own trust score would make the badge worth nothing.
 */
export default function EditListingScreen() {
  const { repo } = useApp();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = typeof id === "string" && id.length > 0;

  const {
    data: existing,
    loading: loadingExisting,
    error: loadError,
  } = useAsync<Listing | null>(() => (editing ? repo.getListing(id) : Promise.resolve(null)), [id]);

  if (editing && loadingExisting && !existing) {
    return <LoadingState label="Loading your listing" />;
  }
  if (editing && loadError) return <ErrorState message={loadError} />;

  return <Form key={existing?.id ?? "new"} existing={existing ?? null} />;
}

function Form({ existing }: { existing: Listing | null }) {
  const { repo, invalidate } = useApp();

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [addressLine, setAddressLine] = useState(existing?.addressLine ?? "");
  const [rent, setRent] = useState(existing ? String(existing.rentCents / 100) : "");
  const [deposit, setDeposit] = useState(
    existing?.depositCents != null ? String(existing.depositCents / 100) : "",
  );
  const [bedrooms, setBedrooms] = useState(String(existing?.bedrooms ?? 1));
  const [bathrooms, setBathrooms] = useState(String(existing?.bathrooms ?? 1));
  const [propertyType, setPropertyType] = useState<PropertyType>(existing?.propertyType ?? "annex");
  const [furnished, setFurnished] = useState<Furnishing>(existing?.furnished ?? "unfurnished");

  // Photos already saved, versus ones picked on this screen and not yet
  // uploaded. Kept apart because removing each means a different thing.
  const [saved, setSaved] = useState(existing?.photos ?? []);
  const [picked, setPicked] = useState<string[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const rentCents = parseLKRInput(rent);
  const photoCount = saved.length + picked.length;

  const addPhoto = async (fromLibrary: boolean) => {
    const permission = fromLibrary
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setSubmitError(
        fromLibrary
          ? "RentLoop needs access to your photos to add one."
          : "RentLoop needs access to the camera to take a photo.",
      );
      return;
    }

    const result = fromLibrary
      ? await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.7,
          allowsMultipleSelection: true,
          selectionLimit: 8 - photoCount,
        })
      : await ImagePicker.launchCameraAsync({ quality: 0.7 });

    if (result.canceled) return;
    setPicked((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 8));
  };

  const removeSaved = (photoId: string) => {
    if (!existing) return;
    Alert.alert("Remove this photo?", "It will be deleted from the listing.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            const updated = await repo.removeListingPhoto(existing.id, photoId);
            setSaved(updated.photos);
          } catch (e) {
            setSubmitError(e instanceof Error ? e.message : "Could not remove that photo");
          }
        },
      },
    ]);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give the place a short name";
    if (!city.trim()) next.city = "Which town or suburb?";
    if (rentCents == null || rentCents <= 0) next.rent = "Enter the monthly rent";
    if (deposit.trim() && parseLKRInput(deposit) == null) next.deposit = "That is not an amount";
    if (!description.trim()) next.description = "Say something about the place";
    if (photoCount === 0) next.photos = "Add at least one photo — nobody enquires without one";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;

    setBusy(true);
    setSubmitError(null);
    try {
      const draft = {
        title,
        description,
        city,
        addressLine: addressLine.trim() || null,
        rentCents: rentCents as number,
        depositCents: deposit.trim() ? parseLKRInput(deposit) : null,
        bedrooms: Math.max(0, parseInt(bedrooms, 10) || 0),
        bathrooms: Math.max(0, parseInt(bathrooms, 10) || 0),
        propertyType,
        furnished,
        availableFrom: null,
        photoUris: picked,
      };

      const listing = existing
        ? await repo.updateListing(existing.id, draft)
        : await repo.createListing(draft);

      invalidate();
      router.replace(`/listing/${listing.id}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not save the listing");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: existing ? "Edit listing" : "Post a place" }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionLabel>Photos</SectionLabel>
          <Card style={styles.photoCard}>
            <Text style={styles.help}>
              The first photo is the one people see in search results. Show the outside first, then
              the rooms.
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
              {saved.map((photo, i) => (
                <Thumb
                  key={photo.id}
                  uri={photo.url}
                  cover={i === 0}
                  onRemove={() => removeSaved(photo.id)}
                />
              ))}
              {picked.map((uri, i) => (
                <Thumb
                  key={uri}
                  uri={uri}
                  cover={saved.length === 0 && i === 0}
                  pending
                  onRemove={() => setPicked((prev) => prev.filter((u) => u !== uri))}
                />
              ))}
              {photoCount < 8 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add a photo"
                  onPress={() => addPhoto(true)}
                  onLongPress={() => addPhoto(false)}
                  style={styles.addTile}
                >
                  <Text style={styles.addPlus}>+</Text>
                  <Text style={styles.addLabel}>Add</Text>
                </Pressable>
              ) : null}
            </ScrollView>

            {errors.photos ? <Text style={styles.error}>{errors.photos}</Text> : null}
            <Text style={styles.footnote}>
              Tap to choose from your photos, hold to use the camera. Up to eight.
            </Text>
          </Card>

          <SectionLabel>The place</SectionLabel>
          <Field
            label="Title"
            required
            value={title}
            onChangeText={setTitle}
            placeholder="Two-bedroom annex with separate entrance"
            maxLength={80}
            error={errors.title}
          />
          <Field
            label="Town or suburb"
            required
            value={city}
            onChangeText={setCity}
            placeholder="Nugegoda"
            error={errors.city}
          />
          <Field
            label="Street or lane"
            value={addressLine}
            onChangeText={setAddressLine}
            placeholder="Off Sarana Road"
            hint="Roughly where it is. The exact address is not shown publicly."
          />
          <Field
            label="Description"
            required
            value={description}
            onChangeText={setDescription}
            placeholder="What is it like to live there? Separate entrance, metered water, how far to the bus."
            multiline
            numberOfLines={5}
            error={errors.description}
          />

          <SectionLabel>Type</SectionLabel>
          <ChipRow
            options={Object.entries(PROPERTY_TYPE_LABEL) as [PropertyType, string][]}
            value={propertyType}
            onChange={setPropertyType}
          />
          <ChipRow
            options={Object.entries(FURNISHING_LABEL) as [Furnishing, string][]}
            value={furnished}
            onChange={setFurnished}
            style={styles.chipsSpaced}
          />

          <SectionLabel>Size</SectionLabel>
          <View style={styles.pair}>
            <Field
              label="Bedrooms"
              value={bedrooms}
              onChangeText={setBedrooms}
              keyboardType="number-pad"
              maxLength={2}
              style={styles.half}
            />
            <Field
              label="Bathrooms"
              value={bathrooms}
              onChangeText={setBathrooms}
              keyboardType="number-pad"
              maxLength={2}
              style={styles.half}
            />
          </View>

          <SectionLabel>Money</SectionLabel>
          <Field
            label="Monthly rent"
            required
            value={rent}
            onChangeText={setRent}
            keyboardType="decimal-pad"
            placeholder="45000"
            hint={rentCents ? `${formatLKR(rentCents)} a month` : "In rupees"}
            error={errors.rent}
          />
          <Field
            label="Deposit"
            value={deposit}
            onChangeText={setDeposit}
            keyboardType="decimal-pad"
            placeholder="90000"
            hint="Leave empty if there is none. Two months is usual."
            error={errors.deposit}
          />

          <Card style={styles.trustCard}>
            <Pill label="NOT YOURS TO SET" tone="warn" />
            <Text style={styles.trustTitle}>Your track record is added automatically</Text>
            <Text style={styles.help}>
              The verified badge, your rating and the number of tenancies on your listing come from
              tenancies RentLoop has actually seen you complete. You cannot type them in, and
              neither can anyone else — that is the whole reason a tenant trusts them.
            </Text>
          </Card>

          {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

          <Button
            label={existing ? "Save changes" : "Post this place"}
            onPress={submit}
            loading={busy}
            style={styles.submit}
          />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function Thumb({
  uri,
  cover,
  pending = false,
  onRemove,
}: {
  uri: string;
  cover: boolean;
  pending?: boolean;
  onRemove: () => void;
}) {
  return (
    <View style={styles.thumbWrap}>
      <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
      {cover ? (
        <View style={styles.coverTag}>
          <Text style={styles.coverText}>COVER</Text>
        </View>
      ) : null}
      {pending ? <View style={styles.pendingDot} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove this photo"
        onPress={onRemove}
        hitSlop={8}
        style={styles.removeButton}
      >
        <Text style={styles.removeText}>×</Text>
      </Pressable>
    </View>
  );
}

function ChipRow<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: [T, string][];
  value: T;
  onChange: (next: T) => void;
  style?: object;
}) {
  return (
    <View style={[styles.chips, style]}>
      {options.map(([key, label]) => {
        const selected = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(key)}
            style={[styles.chip, selected && styles.chipOn]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },

  photoCard: { paddingBottom: space.md },
  help: { ...type.caption, fontSize: 13, lineHeight: 19 },
  strip: { marginTop: space.md },
  thumbWrap: { marginRight: space.sm },
  thumb: { width: 104, height: 104, borderRadius: radius.md, backgroundColor: color.surfaceSunken },
  coverTag: {
    position: "absolute",
    left: space.xs,
    bottom: space.xs,
    backgroundColor: color.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  coverText: { color: color.textInverse, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  pendingDot: {
    position: "absolute",
    right: space.xs,
    bottom: space.xs,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: statusColor.partial.fg,
  },
  removeButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(18,23,34,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: "#FFF", fontSize: 15, lineHeight: 17, fontWeight: "600" },

  addTile: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surfaceSunken,
  },
  addPlus: { fontSize: 24, color: color.accent, lineHeight: 28 },
  addLabel: { ...type.caption, fontSize: 12 },
  footnote: { ...type.caption, fontSize: 12, marginTop: space.md },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chipsSpaced: { marginTop: space.md },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.accentSoft, borderColor: color.accentBorder },
  chipText: { fontSize: 13, color: color.textMuted, fontWeight: "500" },
  chipTextOn: { color: color.accent, fontWeight: "600" },

  pair: { flexDirection: "row", gap: space.md },
  half: { flex: 1 },

  trustCard: { marginTop: space.xl },
  trustTitle: { ...type.heading, marginTop: space.sm, marginBottom: space.xs },

  error: { ...type.caption, color: color.danger, marginTop: space.md },
  submit: { marginTop: space.xl, marginBottom: space.sm },
});

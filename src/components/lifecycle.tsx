/**
 * Shared pieces for the lifecycle screens.
 *
 * `AiCard` is the important one: every assistant output in the app renders
 * through it, so the "this is a suggestion, a human decides" framing is
 * structural rather than something each screen has to remember.
 */

import React from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { color, radius, space, type } from "../theme";
import { MOCK_PHOTO } from "../data/mock/lifecycleSeed";
import type { AiSuggestion, DefectSeverity, Role } from "../data/lifecycleTypes";

// ---------------------------------------------------------------------------
// Assistant
// ---------------------------------------------------------------------------

/**
 * Every AI output in RentLoop renders here.
 *
 * Three rules the component enforces so no screen can quietly break them:
 * it is always labelled as the assistant, it always shows how sure it is, and
 * when it proposes something it always offers a way to say no.
 */
export function AiCard({
  suggestion,
  onAccept,
  onDismiss,
  style,
}: {
  suggestion: AiSuggestion;
  onAccept?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const low = suggestion.confidence < 0.7;
  const settled = suggestion.acceptedAt !== null || suggestion.rejectedAt !== null;

  return (
    <View style={[styles.ai, style]}>
      <View style={styles.aiHeader}>
        <View style={styles.aiBadge}>
          <Text style={styles.aiBadgeText}>ASSISTANT</Text>
        </View>
        <Text style={styles.aiConfidence}>
          {low ? "not confident · " : ""}
          {Math.round(suggestion.confidence * 100)}%
        </Text>
      </View>

      <Text style={styles.aiHeadline}>{suggestion.headline}</Text>
      <Text style={styles.aiDetail}>{suggestion.detail}</Text>

      {settled ? (
        <Text style={styles.aiSettled}>
          {suggestion.acceptedAt ? "You accepted this" : "You dismissed this"}
        </Text>
      ) : onAccept || onDismiss ? (
        <View style={styles.aiActions}>
          {onAccept ? (
            <Pressable accessibilityRole="button" onPress={onAccept} style={styles.aiAccept}>
              <Text style={styles.aiAcceptText}>Use this</Text>
            </Pressable>
          ) : null}
          {onDismiss ? (
            <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.aiDismiss}>
              <Text style={styles.aiDismissText}>No thanks</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Footer line for any screen showing assistant output. */
export function AiDisclaimer() {
  return (
    <Text style={styles.disclaimer}>
      The assistant reads and organises. It never decides anything — every suggestion above waits
      for you.
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/**
 * An inspection or maintenance photo. Seeded photos are `mock://photo/<label>`
 * and draw as a labelled placeholder; anything picked in-app is a real file URI
 * and renders normally.
 */
export function PhotoTile({
  uri,
  size = 96,
  style,
}: {
  uri: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const isMock = uri.startsWith(MOCK_PHOTO);
  const label = isMock ? decodeURIComponent(uri.slice(MOCK_PHOTO.length + 1)) : "";

  return (
    <View style={[{ width: size, height: size }, styles.tile, style]}>
      {isMock ? (
        <>
          <Text style={styles.tileGlyph}>▣</Text>
          <Text style={styles.tileLabel} numberOfLines={3}>
            {label}
          </Text>
        </>
      ) : (
        <Image source={{ uri }} style={styles.tileImage} resizeMode="cover" />
      )}
    </View>
  );
}

export function PhotoRow({ uris, size = 96 }: { uris: string[]; size?: number }) {
  if (uris.length === 0) return null;
  return (
    <View style={styles.photoRow}>
      {uris.map((uri) => (
        <PhotoTile key={uri} uri={uri} size={size} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export function Timeline({
  items,
  viewerRole,
}: {
  items: { id: string; label: string; note: string | null; meta: string; by?: Role }[];
  /** Who is looking — "You" has to mean the reader, not always the tenant. */
  viewerRole: Role;
}) {
  return (
    <View>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <View key={item.id} style={styles.timelineRow}>
            <View style={styles.timelineGutter}>
              <View style={[styles.timelineDot, last && styles.timelineDotLast]} />
              {!last ? <View style={styles.timelineLine} /> : null}
            </View>
            <View style={styles.timelineBody}>
              <Text style={styles.timelineLabel}>{item.label}</Text>
              {item.note ? <Text style={styles.timelineNote}>{item.note}</Text> : null}
              <Text style={styles.timelineMeta}>
                {item.meta}
                {item.by ? ` · ${actorName(item.by, viewerRole)}` : ""}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Who did a thing, from the reader's point of view. */
export function actorName(actor: Role, viewer: Role): string {
  if (actor === viewer) return "You";
  return actor === "tenant" ? "Tenant" : "Landlord";
}

// ---------------------------------------------------------------------------
// Small bits
// ---------------------------------------------------------------------------

/** A tappable row — the backbone of the hub screens. */
export function NavRow({
  title,
  subtitle,
  badge,
  onPress,
  tone = "default",
}: {
  title: string;
  subtitle?: string;
  badge?: string | null;
  onPress: () => void;
  tone?: "default" | "attention";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
    >
      <View style={styles.navBody}>
        <Text style={styles.navTitle}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.navSub, tone === "attention" && { color: color.danger }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.navBadge, tone === "attention" && { backgroundColor: color.danger }]}>
          <Text style={styles.navBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.navChevron}>›</Text>
    </Pressable>
  );
}

export function Pill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
}) {
  return (
    <View style={[styles.pill, PILL_TONE[tone].box]}>
      <Text style={[styles.pillText, PILL_TONE[tone].text]}>{label}</Text>
    </View>
  );
}

const PILL_TONE = {
  neutral: { box: { backgroundColor: "#EFF1F4" }, text: { color: "#5D6672" } },
  good: { box: { backgroundColor: "#E6F2EB" }, text: { color: "#1B5E3F" } },
  warn: { box: { backgroundColor: "#FCF1DC" }, text: { color: "#8A5A00" } },
  bad: { box: { backgroundColor: "#FBEAEA" }, text: { color: "#9B1C1C" } },
  info: { box: { backgroundColor: "#E9EDF7" }, text: { color: "#25408F" } },
} as const;

export const severityTone: Record<DefectSeverity, "warn" | "bad"> = {
  minor: "warn",
  moderate: "warn",
  severe: "bad",
};

export function Stars({ rating, size = 15 }: { rating: number; size?: number }) {
  // Distinct glyphs, not just a colour change — a screen reader and a
  // copy-pasted screenshot both need to see the difference.
  const filled = Math.round(rating);
  return (
    <Text
      accessibilityLabel={`${rating} out of 5`}
      style={{ fontSize: size, color: "#B8860B", letterSpacing: 1 }}
    >
      {"★".repeat(filled)}
      <Text style={{ color: color.borderStrong }}>{"☆".repeat(5 - filled)}</Text>
    </Text>
  );
}

/** Big number + caption, used across both dashboards. */
export function Stat({ value, label, tone }: { value: string; label: string; tone?: "bad" }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone === "bad" && { color: color.danger }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <Text style={styles.empty}>{children}</Text>;
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  ai: {
    backgroundColor: "#F4F1FB",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DDD5F2",
    padding: space.lg,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  aiBadge: {
    backgroundColor: "#5B4B9E",
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  aiBadgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8, color: "#FFFFFF" },
  aiConfidence: { fontSize: 11, color: "#6B5FA8", fontVariant: ["tabular-nums"] },
  aiHeadline: { fontSize: 15, fontWeight: "600", color: "#2E2453", lineHeight: 21 },
  aiDetail: { fontSize: 13.5, color: "#5B5480", marginTop: space.xs, lineHeight: 19 },
  aiActions: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  aiAccept: {
    backgroundColor: "#5B4B9E",
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  aiAcceptText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  aiDismiss: {
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  aiDismissText: { color: "#6B5FA8", fontSize: 13, fontWeight: "600" },
  aiSettled: { fontSize: 12, color: "#6B5FA8", marginTop: space.md, fontStyle: "italic" },
  disclaimer: {
    ...type.caption,
    fontSize: 12,
    marginTop: space.lg,
    lineHeight: 17,
    fontStyle: "italic",
  },

  tile: {
    borderRadius: radius.sm,
    backgroundColor: color.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    padding: space.sm,
    overflow: "hidden",
  },
  tileImage: { width: "100%", height: "100%" },
  tileGlyph: { fontSize: 20, color: color.textFaint },
  tileLabel: {
    fontSize: 9,
    color: color.textMuted,
    textAlign: "center",
    marginTop: space.xs,
    lineHeight: 12,
  },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },

  timelineRow: { flexDirection: "row", gap: space.md },
  timelineGutter: { alignItems: "center", width: 14 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.accent,
    marginTop: 5,
  },
  timelineDotLast: { backgroundColor: color.accent },
  timelineLine: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: color.borderStrong },
  timelineBody: { flex: 1, paddingBottom: space.lg },
  timelineLabel: { fontSize: 14.5, fontWeight: "600", color: color.text },
  timelineNote: { fontSize: 13.5, color: color.textMuted, marginTop: 2, lineHeight: 19 },
  timelineMeta: { fontSize: 12, color: color.textFaint, marginTop: 3 },

  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  navRowPressed: { backgroundColor: color.surfaceSunken },
  navBody: { flex: 1 },
  navTitle: { fontSize: 15, fontWeight: "600", color: color.text },
  navSub: { fontSize: 13, color: color.textMuted, marginTop: 2, lineHeight: 18 },
  navBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  navBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  navChevron: { fontSize: 22, color: color.textFaint },

  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 12, fontWeight: "600" },

  stat: { flex: 1 },
  statValue: { fontSize: 22, fontWeight: "700", color: color.text, fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 12, color: color.textMuted, marginTop: 2 },

  empty: { ...type.bodyMuted, fontSize: 14, lineHeight: 21 },
});

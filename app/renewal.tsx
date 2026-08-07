import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { Pill } from "@/components/lifecycle";
import { Button, Card, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { daysBetween, formatDate, formatLKR, todayISO } from "@/data/ledger";
import type { Agreement, Renewal } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

/**
 * Stay or go.
 *
 * The decision itself is trivial; the reason this screen exists is that the
 * notice deadline is the one date in a tenancy you genuinely cannot recover
 * from missing. So the deadline is stated before the choice, in days rather
 * than as a date, and choosing to leave shows exactly what it commits you to.
 */
export default function RenewalScreen() {
  const { tenancy, repo, invalidate } = useApp();
  const tenancyId = tenancy?.tenancy.id ?? null;

  const { data: renewal, loading } = useAsync<Renewal | null>(
    async () => (tenancyId ? repo.getRenewal(tenancyId) : null),
    [tenancyId],
  );
  const { data: agreement } = useAsync<Agreement | null>(
    async () => (tenancyId ? repo.getAgreement(tenancyId) : null),
    [tenancyId],
  );

  const [busy, setBusy] = useState(false);

  const decide = async (intent: "renewing" | "leaving") => {
    if (!tenancyId) return;
    setBusy(true);
    try {
      await repo.decideRenewal(tenancyId, intent);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  if (loading && !renewal) return <LoadingState />;
  if (!renewal || !tenancy) return null;

  const endsOn = agreement?.endsOn ?? null;
  const noticeDays = agreement?.noticePeriodDays ?? null;
  const noticeBy =
    endsOn && noticeDays !== null
      ? new Date(new Date(`${endsOn}T00:00:00Z`).getTime() - noticeDays * 86_400_000)
          .toISOString()
          .slice(0, 10)
      : null;
  const daysToNotice = noticeBy ? daysBetween(todayISO(), noticeBy) : null;

  return (
    <>
      <Stack.Screen options={{ title: "Renewal" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Card>
          <Text style={type.label}>Your agreement ends</Text>
          <Text style={styles.big}>{endsOn ? formatDate(endsOn) : "Not known"}</Text>

          {noticeBy && daysToNotice !== null ? (
            <View style={[styles.deadline, daysToNotice < 45 && styles.deadlineUrgent]}>
              <Text style={[styles.deadlineText, daysToNotice < 45 && styles.deadlineTextUrgent]}>
                {daysToNotice < 0
                  ? `The notice deadline passed on ${formatDate(noticeBy)}.`
                  : `You have ${daysToNotice} days to give notice — until ${formatDate(noticeBy)}.`}
              </Text>
              <Text style={styles.deadlineSub}>
                {noticeDays} days notice, taken from your agreement.
              </Text>
            </View>
          ) : (
            <Text style={styles.unknown}>
              No notice period confirmed yet. Confirm it on the agreement screen and this becomes a
              real deadline.
            </Text>
          )}
        </Card>

        {renewal.intent !== "undecided" ? (
          <Card style={styles.decided}>
            <Pill
              label={renewal.intent === "renewing" ? "Staying on" : "Notice given"}
              tone={renewal.intent === "renewing" ? "good" : "warn"}
            />
            <Text style={styles.decidedText}>
              {renewal.intent === "renewing"
                ? `You told your landlord you intend to stay${renewal.decidedOn ? ` on ${formatDate(renewal.decidedOn)}` : ""}. Nothing else happens automatically — a new agreement still has to be signed.`
                : `You gave notice${renewal.noticeGivenOn ? ` on ${formatDate(renewal.noticeGivenOn)}` : ""}. Next: book your move-out inspection so the deposit has evidence behind it.`}
            </Text>
            {renewal.intent === "leaving" ? (
              <Button
                label="Start the move-out inspection"
                onPress={() => router.push("/inspection/move_out")}
                style={styles.decidedButton}
              />
            ) : null}
            <Button
              label="Change my mind"
              variant="ghost"
              onPress={() => decide(renewal.intent === "renewing" ? "leaving" : "renewing")}
              disabled={busy}
            />
          </Card>
        ) : (
          <>
            <SectionLabel>What do you want to do?</SectionLabel>
            <View style={styles.options}>
              <View style={styles.option}>
                <Text style={styles.optionTitle}>Stay on</Text>
                <Text style={styles.optionBody}>
                  Rent stays at {formatLKR(tenancy.tenancy.rent_amount_cents)} unless your landlord
                  proposes a change. You will need to sign a new agreement before the current one
                  runs out.
                </Text>
                <Button
                  label="I want to stay"
                  onPress={() => decide("renewing")}
                  disabled={busy}
                  style={styles.optionButton}
                />
              </View>

              <View style={styles.option}>
                <Text style={styles.optionTitle}>Move out</Text>
                <Text style={styles.optionBody}>
                  Gives notice today. You would need to be out by{" "}
                  {endsOn ? formatDate(endsOn) : "the end of the agreement"}, and your deposit is
                  settled against your move-out inspection.
                </Text>
                <Button
                  label="I want to leave"
                  variant="secondary"
                  onPress={() => decide("leaving")}
                  disabled={busy}
                  style={styles.optionButton}
                />
              </View>
            </View>
          </>
        )}

        <Text style={styles.footnote}>
          Recording an intention here is not the same as serving legal notice. Tell your landlord in
          writing too — the message thread is a reasonable place, because it is timestamped.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  big: { ...type.moneyLarge, fontSize: 24, marginTop: space.xs },
  deadline: {
    marginTop: space.lg,
    backgroundColor: color.accentSoft,
    borderRadius: radius.sm,
    padding: space.md,
  },
  deadlineUrgent: { backgroundColor: "#FCF1DC" },
  deadlineText: { fontSize: 14, color: color.accent, fontWeight: "600", lineHeight: 20 },
  deadlineTextUrgent: { color: "#8A5A00" },
  deadlineSub: { fontSize: 12, color: color.textMuted, marginTop: space.xs },
  unknown: { ...type.caption, fontSize: 13, marginTop: space.md, lineHeight: 19 },

  decided: { marginTop: space.lg },
  decidedText: { ...type.body, fontSize: 14, lineHeight: 21, marginTop: space.md },
  decidedButton: { marginTop: space.lg, marginBottom: space.sm },

  options: { gap: space.sm },
  option: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.lg,
  },
  optionTitle: { fontSize: 16, fontWeight: "600", color: color.text },
  optionBody: { ...type.caption, fontSize: 13.5, lineHeight: 20, marginTop: space.xs },
  optionButton: { marginTop: space.lg },

  footnote: { ...type.caption, fontSize: 12, marginTop: space.xl, lineHeight: 18 },
});

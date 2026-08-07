import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StatusChip } from "@/components/StatusChip";
import { AiCard, NavRow, Pill } from "@/components/lifecycle";
import { ReminderRow } from "../reminders";
import { Button, Card, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import {
  describeDueDate,
  firstOfMonth,
  formatDate,
  formatLKR,
  formatPeriodMonth,
  todayISO,
} from "@/data/ledger";
import type { LedgerRow } from "@/data/types";
import type { LifecycleOverview, Reminder } from "@/data/lifecycleTypes";
import { color, radius, space, type } from "@/theme";

/**
 * The tenant's hub — everything about the tenancy that is not the rent ledger,
 * plus a single line about the rent so the recurring thing is never more than
 * one tap away.
 */
export default function TenantHome() {
  const { session, tenancy, booting, repo } = useApp();
  const insets = useSafeAreaInsets();

  const tenancyId = tenancy?.tenancy.id ?? null;

  const { data: overview } = useAsync<LifecycleOverview | null>(
    async () => (tenancyId ? repo.getOverview(tenancyId) : null),
    [tenancyId],
  );
  const { data: ledger } = useAsync<LedgerRow[]>(
    async () => (tenancyId ? repo.listLedger(tenancyId) : []),
    [tenancyId],
  );
  const { data: reminders } = useAsync<Reminder[]>(
    async () => (tenancyId ? repo.listReminders(tenancyId, "tenant") : []),
    [tenancyId],
  );

  if (booting) return <LoadingState />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!tenancy) return <Redirect href="/create-tenancy" />;

  const thisMonth = firstOfMonth(todayISO());
  const current = ledger?.find((r) => r.period_month === thisMonth) ?? null;
  const behind = ledger?.filter((r) => r.status === "overdue" || r.status === "partial") ?? [];
  const arrears = behind.reduce((sum, r) => sum + r.balance_cents, 0);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
      ]}
    >
      <Text style={type.caption}>Good day, {session.displayName.split(" ")[0]}</Text>
      <Text style={[type.title, styles.property]}>{tenancy.property.label}</Text>

      {/* Rent first — it is the reason they opened the app. */}
      <Card style={styles.rentCard}>
        <View style={styles.rentTop}>
          <View style={{ flex: 1 }}>
            <Text style={type.label}>
              {current ? formatPeriodMonth(current.period_month) : "This month"}
            </Text>
            <Text style={[type.moneyLarge, styles.rentAmount]}>
              {current
                ? formatLKR(current.balance_cents > 0 ? current.balance_cents : current.paid_cents)
                : formatLKR(tenancy.tenancy.rent_amount_cents)}
            </Text>
            <Text style={type.caption}>
              {current
                ? current.balance_cents > 0
                  ? describeDueDate(current.due_date)
                  : "Settled for this month"
                : "Rent due"}
            </Text>
          </View>
          {current ? <StatusChip status={current.status} /> : null}
        </View>

        {arrears > 0 ? (
          <View style={styles.arrears}>
            <Text style={styles.arrearsText}>
              {formatLKR(arrears)} outstanding from {behind.length}{" "}
              {behind.length === 1 ? "earlier month" : "earlier months"}
            </Text>
          </View>
        ) : null}

        <View style={styles.rentActions}>
          <Button
            label="Record a payment"
            onPress={() =>
              current
                ? router.push(`/record-payment?periodId=${current.id}`)
                : router.push("/tenant/ledger")
            }
            style={{ flex: 1 }}
          />
          <Button
            label="Ledger"
            variant="secondary"
            onPress={() => router.push("/tenant/ledger")}
            style={{ flex: 1 }}
          />
        </View>
      </Card>

      {/* Anything the assistant thinks is unfinished. */}
      {overview?.agreementStatus === "needs_review" ? (
        <AiCard
          style={styles.aiSpacing}
          suggestion={{
            id: "agreement-review",
            kind: "extraction",
            headline: "Your agreement has terms waiting for you to confirm",
            detail:
              "I read the document and pulled out the rent, deposit, notice period and end date. Three of them I am not confident about — check them and they become your reminders.",
            confidence: 0.82,
            acceptedAt: null,
            rejectedAt: null,
          }}
          onAccept={() => router.push("/agreement")}
        />
      ) : null}

      {reminders && reminders.length > 0 ? (
        <>
          <View style={styles.remindersHeader}>
            <SectionLabel style={{ marginTop: 0, marginBottom: 0 }}>Needs you</SectionLabel>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/reminders")}
              hitSlop={8}
            >
              <Text style={styles.seeAll}>See all {reminders.length}</Text>
            </Pressable>
          </View>
          <View style={styles.rows}>
            {reminders.slice(0, 2).map((reminder) => (
              <ReminderRow key={reminder.id} reminder={reminder} />
            ))}
          </View>
        </>
      ) : null}

      {overview && overview.upcomingDeadlines.length > 0 ? (
        <>
          <SectionLabel>Coming up</SectionLabel>
          <Card>
            {overview.upcomingDeadlines.map((deadline, index) => (
              <View
                key={deadline.label}
                style={[styles.deadline, index > 0 && styles.deadlineBorder]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{deadline.label}</Text>
                  <Text style={type.caption}>{formatDate(deadline.on)}</Text>
                </View>
                <Pill
                  label={
                    deadline.daysAway < 0
                      ? "Passed"
                      : deadline.daysAway < 60
                        ? `${deadline.daysAway} days`
                        : `${Math.round(deadline.daysAway / 30)} months`
                  }
                  tone={deadline.daysAway < 0 ? "bad" : deadline.daysAway < 60 ? "warn" : "neutral"}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionLabel>Your tenancy</SectionLabel>
      <View style={styles.rows}>
        <NavRow
          title="Repairs and maintenance"
          subtitle={
            overview?.openTickets
              ? `${overview.openTickets} open ${overview.openTickets === 1 ? "issue" : "issues"}`
              : "Nothing open"
          }
          badge={overview?.openTickets ? String(overview.openTickets) : null}
          tone={overview?.openTickets ? "attention" : "default"}
          onPress={() => router.push("/tenant/repairs")}
        />
        <NavRow
          title="Messages"
          subtitle={overview?.unreadThreads ? `${overview.unreadThreads} unread` : "All caught up"}
          badge={overview?.unreadThreads ? String(overview.unreadThreads) : null}
          onPress={() => router.push("/thread")}
        />
        <NavRow
          title="Agreement"
          subtitle={AGREEMENT_SUBTITLE[overview?.agreementStatus ?? "none"]}
          tone={overview?.agreementStatus === "needs_review" ? "attention" : "default"}
          onPress={() => router.push("/agreement")}
        />
        <NavRow
          title="Move-in evidence"
          subtitle={
            overview?.moveInStatus === "complete"
              ? "Recorded — protects your deposit"
              : "Not finished"
          }
          tone={overview?.moveInStatus === "complete" ? "default" : "attention"}
          onPress={() => router.push("/inspection/move_in")}
        />
      </View>
    </ScrollView>
  );
}

const AGREEMENT_SUBTITLE: Record<string, string> = {
  none: "Not uploaded yet",
  processing: "Being read",
  needs_review: "Terms need your confirmation",
  confirmed: "Confirmed",
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl },
  property: { marginTop: 2, marginBottom: space.lg },

  rentCard: {},
  rentTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  rentAmount: { marginTop: space.xs, marginBottom: 2 },
  arrears: {
    marginTop: space.lg,
    backgroundColor: color.dangerSoft,
    borderRadius: radius.sm,
    padding: space.md,
  },
  arrearsText: { fontSize: 13, color: color.danger, fontWeight: "500" },
  rentActions: { flexDirection: "row", gap: space.sm, marginTop: space.lg },

  aiSpacing: { marginTop: space.lg },

  deadline: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
  },
  deadlineBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },

  rows: { gap: space.sm },
  remindersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  seeAll: { fontSize: 13, fontWeight: "600", color: color.accent },
});

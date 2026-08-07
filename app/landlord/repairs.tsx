import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyNote } from "@/components/lifecycle";
import { Card, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import type { MaintenanceTicket } from "@/data/lifecycleTypes";
import { color, space, type } from "@/theme";
import { TicketRow } from "../tenant/repairs";

/**
 * Repairs across every property, with the ones waiting on the landlord first.
 *
 * Same ticket rows as the tenant side — the record is shared, which is the
 * whole argument for connected mode. What differs is the ordering and the
 * actions available inside.
 */
export default function LandlordRepairs() {
  const { repo } = useApp();
  const insets = useSafeAreaInsets();

  const { data: tickets, loading } = useAsync<MaintenanceTicket[]>(
    () => repo.listTickets(null),
    [],
  );

  const waiting = tickets?.filter((t) => t.status === "reported") ?? [];
  const active =
    tickets?.filter((t) => ["acknowledged", "approved", "in_progress"].includes(t.status)) ?? [];
  const done = tickets?.filter((t) => t.status === "resolved" || t.status === "declined") ?? [];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
      ]}
    >
      <Text style={type.caption}>Landlord view</Text>
      <Text style={[type.title, styles.heading]}>Repairs</Text>

      {loading && !tickets ? (
        <View style={styles.loading}>
          <LoadingState />
        </View>
      ) : (
        <>
          <SectionLabel>Waiting on you</SectionLabel>
          {waiting.length === 0 ? (
            <Card>
              <EmptyNote>Nothing needs a decision right now.</EmptyNote>
            </Card>
          ) : (
            <View style={styles.list}>
              {waiting.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} showTenancy="Annex, Nugegoda" />
              ))}
            </View>
          )}

          {active.length > 0 ? (
            <>
              <SectionLabel>In progress</SectionLabel>
              <View style={styles.list}>
                {active.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} showTenancy="Annex, Nugegoda" />
                ))}
              </View>
            </>
          ) : null}

          {done.length > 0 ? (
            <>
              <SectionLabel>Closed</SectionLabel>
              <View style={styles.list}>
                {done.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} showTenancy="Annex, Nugegoda" />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl },
  heading: { marginTop: 2, marginBottom: space.sm },
  loading: { height: 160 },
  list: { gap: space.sm },
});

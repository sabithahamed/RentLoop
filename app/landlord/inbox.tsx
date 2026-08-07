import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, LoadingState } from "@/components/ui";
import { EmptyNote } from "@/components/lifecycle";
import { useApp, useAsync } from "@/data/store";
import type { Thread } from "@/data/lifecycleTypes";
import { color, space, type } from "@/theme";
import { ThreadRow } from "../thread/index";

export default function LandlordInbox() {
  const { tenancy, repo } = useApp();
  const insets = useSafeAreaInsets();
  const tenancyId = tenancy?.tenancy.id ?? null;

  const { data: threads, loading } = useAsync<Thread[]>(
    async () => (tenancyId ? repo.listThreads(tenancyId) : []),
    [tenancyId],
  );

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
      ]}
    >
      <Text style={type.caption}>Landlord view</Text>
      <Text style={[type.title, styles.heading]}>Messages</Text>
      <Text style={[type.caption, styles.sub]}>
        Every conversation stays attached to the payment or repair it is about, so nothing has to be
        reconstructed from WhatsApp a year later.
      </Text>

      {loading && !threads ? (
        <View style={styles.loading}>
          <LoadingState />
        </View>
      ) : threads && threads.length > 0 ? (
        <View style={styles.list}>
          {threads.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} viewerRole="landlord" />
          ))}
        </View>
      ) : (
        <Card>
          <EmptyNote>No conversations yet.</EmptyNote>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl },
  heading: { marginTop: 2 },
  sub: { marginTop: space.xs, marginBottom: space.lg, lineHeight: 19 },
  loading: { height: 160 },
  list: { gap: space.sm },
});

import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { Card, ErrorState, LoadingState, SectionLabel } from "@/components/ui";
import { useApp, useAsync } from "@/data/store";
import { formatDate } from "@/data/ledger";
import type { ListingEnquiry } from "@/data/lifecycleTypes";
import { color, space, type } from "@/theme";

/**
 * Who asked about a place, and how to answer them.
 *
 * The name and number here were not looked up — profiles are readable only by
 * their owner. They were attached by the sender when they chose to send the
 * enquiry, which is the only way a landlord gets to know who is asking.
 */
export default function EnquiriesScreen() {
  const { repo } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    data: enquiries,
    loading,
    error,
  } = useAsync<ListingEnquiry[]>(() => repo.listEnquiries(id), [id]);

  if (loading && !enquiries) return <LoadingState label="Loading enquiries" />;
  if (error) return <ErrorState message={error} />;

  return (
    <>
      <Stack.Screen options={{ title: "Enquiries" }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {(enquiries ?? []).length === 0 ? (
          <Card>
            <Text style={type.heading}>Nobody has asked yet</Text>
            <Text style={styles.body}>
              Enquiries appear here with the sender&apos;s name and number, so you can call them
              back.
            </Text>
          </Card>
        ) : (
          <>
            <SectionLabel>
              {enquiries?.length} {enquiries?.length === 1 ? "person asked" : "people asked"}
            </SectionLabel>
            <View style={styles.list}>
              {enquiries?.map((enquiry) => (
                <Card key={enquiry.id}>
                  <View style={styles.head}>
                    <Text style={styles.name}>{enquiry.fromName ?? "Someone"}</Text>
                    <Text style={styles.date}>{formatDate(enquiry.sentOn)}</Text>
                  </View>
                  <Text style={styles.message}>{enquiry.message}</Text>

                  {enquiry.fromPhone ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${enquiry.fromName ?? "them"}`}
                      onPress={() => Linking.openURL(`tel:${enquiry.fromPhone}`)}
                      style={styles.callRow}
                    >
                      <Text style={styles.call}>Call {enquiry.fromPhone}</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.noPhone}>
                      No number on their account — reply is not possible from here yet.
                    </Text>
                  )}
                </Card>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  body: { ...type.body, fontSize: 14, lineHeight: 21, marginTop: space.sm },

  list: { gap: space.md },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  name: { ...type.heading, fontSize: 15 },
  date: { ...type.caption, fontSize: 12 },
  message: { ...type.body, fontSize: 14, lineHeight: 21, marginTop: space.sm },

  callRow: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  call: { fontSize: 14, fontWeight: "600", color: color.accent },
  noPhone: { ...type.caption, fontSize: 12, marginTop: space.md },
});

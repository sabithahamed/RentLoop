import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavRow, Pill } from '@/components/lifecycle';
import { Button, Card, SectionLabel } from '@/components/ui';
import { useApp } from '@/data/store';
import { color, space, type } from '@/theme';

export default function LandlordMore() {
  const { role, setRole, signOut } = useApp();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
      ]}
    >
      <Text style={type.title}>More</Text>

      <SectionLabel>Tenancies</SectionLabel>
      <View style={styles.rows}>
        <NavRow
          title="Deposit settlements"
          subtitle="Move-out comparisons and deductions"
          onPress={() => router.push('/deposit')}
        />
        <NavRow
          title="Reviews"
          subtitle="What tenants said, and what you said about them"
          onPress={() => router.push('/reviews')}
        />
      </View>

      <SectionLabel>Prototype controls</SectionLabel>
      <Card>
        <Text style={type.heading}>Viewing as {role}</Text>
        <Text style={styles.roleNote}>
          The landlord side is a separate persona with its own properties. Switching back returns
          you to the tenant account and its ledger.
        </Text>
        <View style={styles.roleRow}>
          <Pill label="DEMO ONLY" tone="warn" />
        </View>
        <Button
          label="Switch to the tenant view"
          variant="secondary"
          onPress={() => {
            setRole('tenant');
            router.replace('/tenant/home');
          }}
          style={styles.roleButton}
        />
      </Card>

      <Button
        label="Sign out"
        variant="danger"
        onPress={() => signOut().then(() => router.replace('/sign-in'))}
        style={styles.signOut}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl },
  rows: { gap: space.sm },
  roleNote: { ...type.caption, fontSize: 13, marginTop: space.sm, lineHeight: 19 },
  roleRow: { marginTop: space.md },
  roleButton: { marginTop: space.md },
  signOut: { marginTop: space.xxl },
});

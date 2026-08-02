import React from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';

import { useApp } from '@/data/store';
import { LoadingState } from '@/components/ui';
import { color } from '@/theme';

/** Routing gate: signed out → sign in; no tenancy → onboarding; otherwise the role's home. */
export default function Index() {
  const { booting, session, tenancy, role } = useApp();

  if (booting) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <LoadingState label="Starting RentLoop" />
      </View>
    );
  }

  if (!session) return <Redirect href="/sign-in" />;
  if (role === 'landlord') return <Redirect href="/landlord/portfolio" />;
  if (!tenancy) return <Redirect href="/create-tenancy" />;
  return <Redirect href="/tenant/home" />;
}

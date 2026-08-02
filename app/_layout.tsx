import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '@/data/store';
import { color } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: color.bg },
            headerShadowVisible: false,
            headerTintColor: color.accent,
            headerTitleStyle: { color: color.text, fontSize: 17, fontWeight: '600' },
            contentStyle: { backgroundColor: color.bg },
          }}
        >
          {/* Entry and onboarding */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
          <Stack.Screen name="create-tenancy" options={{ title: 'Your tenancy' }} />

          {/* The two role shells own their own tab bars */}
          <Stack.Screen name="tenant" options={{ headerShown: false }} />
          <Stack.Screen name="landlord" options={{ headerShown: false }} />

          {/* Detail screens, shared by both roles */}
          <Stack.Screen name="period/[id]" options={{ title: '' }} />
          <Stack.Screen
            name="record-payment"
            options={{ title: 'Record payment', presentation: 'modal' }}
          />
          <Stack.Screen name="payment/[id]" options={{ title: 'Payment' }} />
          <Stack.Screen name="agreement" options={{ title: 'Agreement' }} />
          <Stack.Screen name="inspection/[kind]" options={{ title: 'Inspection' }} />
          <Stack.Screen name="inspection/compare" options={{ title: 'Comparison' }} />
          <Stack.Screen name="maintenance/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="maintenance/[id]" options={{ title: 'Repair' }} />
          <Stack.Screen name="thread/index" options={{ title: 'Messages' }} />
          <Stack.Screen name="thread/[id]" options={{ title: 'Conversation' }} />
          <Stack.Screen name="thread/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="deposit" options={{ title: 'Deposit' }} />
          <Stack.Screen name="reviews" options={{ title: 'Reviews' }} />
          <Stack.Screen name="review/new" options={{ title: 'Write a review' }} />
          <Stack.Screen name="discover" options={{ title: 'Find a place' }} />
          <Stack.Screen name="listing/[id]" options={{ title: 'Listing' }} />
          <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
          <Stack.Screen name="renewal" options={{ title: 'Renewal' }} />
          <Stack.Screen name="invite" options={{ title: 'Invite' }} />
          <Stack.Screen name="receipt/[paymentId]" options={{ title: 'Receipt' }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}

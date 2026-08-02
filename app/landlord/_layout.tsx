import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useApp } from '@/data/store';
import { color } from '@/theme';

export default function LandlordTabs() {
  const { role } = useApp();

  if (role === 'tenant') return <Redirect href="/tenant/home" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textFaint,
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ color: c, size }) => <Ionicons name="business-outline" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="repairs"
        options={{
          title: 'Repairs',
          tabBarIcon: ({ color: c, size }) => <Ionicons name="construct-outline" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color: c, size }) => <Ionicons name="chatbubbles-outline" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color: c, size }) => <Ionicons name="ellipsis-horizontal" size={size} color={c} />,
        }}
      />
    </Tabs>
  );
}

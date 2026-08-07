import React from "react";
import { Redirect, Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useApp } from "@/data/store";
import { color } from "@/theme";

/**
 * The tenant's five tabs.
 *
 * Home is the lifecycle hub — everything that is not rent. Ledger gets its own
 * tab because it is the thing tenants open monthly, and burying the recurring
 * action under a hub would be a mistake.
 */
export default function TenantTabs() {
  const { role } = useApp();

  // Flipping the role switch in More should land you on the other side of the
  // app, not leave you on a tenant tab rendering landlord data.
  if (role === "landlord") return <Redirect href="/landlord/portfolio" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textFaint,
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color: c, size }) => (
            <Ionicons name="home-outline" size={size} color={c} />
          ),
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: "Rent",
          tabBarIcon: ({ color: c, size }) => (
            <Ionicons name="receipt-outline" size={size} color={c} />
          ),
        }}
      />
      <Tabs.Screen
        name="repairs"
        options={{
          title: "Repairs",
          tabBarIcon: ({ color: c, size }) => (
            <Ionicons name="construct-outline" size={size} color={c} />
          ),
        }}
      />
      <Tabs.Screen
        name="property"
        options={{
          title: "Property",
          tabBarIcon: ({ color: c, size }) => (
            <Ionicons name="document-text-outline" size={size} color={c} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color: c, size }) => (
            <Ionicons name="ellipsis-horizontal" size={size} color={c} />
          ),
        }}
      />
    </Tabs>
  );
}

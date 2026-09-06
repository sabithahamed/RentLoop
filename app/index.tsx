import React from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";

import { useApp } from "@/data/store";
import { LoadingState } from "@/components/ui";
import { color } from "@/theme";

/**
 * Routing gate.
 *
 * Signed out lands on discovery rather than a sign-in wall. Somebody who has
 * not signed up yet is almost always looking for a place, and making them
 * create an account before they can see a single listing is how a rental app
 * gets deleted before it is used. Saving and enquiring still ask for an
 * account, at the point where one is actually needed.
 */
export default function Index() {
  const { booting, session, tenancy, role } = useApp();

  if (booting) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <LoadingState label="Starting RentLoop" />
      </View>
    );
  }

  if (!session) return <Redirect href="/discover" />;
  if (role === "landlord") return <Redirect href="/landlord/portfolio" />;

  if (!tenancy) return <Redirect href="/onboarding/tenant" />;
  return <Redirect href="/tenant/home" />;
}

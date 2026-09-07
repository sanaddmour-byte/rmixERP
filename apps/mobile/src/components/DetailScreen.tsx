import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { colors } from "../theme";

interface DetailField {
  label: string;
  value: string;
}

interface DetailScreenProps {
  isLoading: boolean;
  notFound: boolean;
  notFoundLabel: string;
  fields: DetailField[];
  children?: React.ReactNode;
}

/** Read-only field list — the shared shell for mobile master-data detail screens. */
export function DetailScreen({ isLoading, notFound, notFoundLabel, fields, children }: DetailScreenProps) {
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ color: colors.textMuted }}>{notFoundLabel}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={{ gap: 12 }}>
        {fields.map((field) => (
          <View key={field.label} style={{ gap: 2 }}>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>{field.label}</Text>
            <Text style={{ fontSize: 15 }}>{field.value}</Text>
          </View>
        ))}
      </View>
      {children}
    </ScrollView>
  );
}

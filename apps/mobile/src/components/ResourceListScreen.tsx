import * as React from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useLanguage } from "../i18n/LanguageContext";
import { colors } from "../theme";

interface ResourceListScreenProps<T extends { id: string }> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onSearch: (q: string) => void;
  onPressItem: (item: T) => void;
  renderRow: (item: T) => { title: string; subtitle?: string | undefined };
}

/** Read-only searchable, paginated list — the shared shell for mobile master-data lookups. */
export function ResourceListScreen<T extends { id: string }>({
  items,
  total,
  page,
  pageSize,
  isLoading,
  onPageChange,
  onSearch,
  onPressItem,
  renderRow,
}: ResourceListScreenProps<T>) {
  const { t } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <TextInput
        placeholder={t.resource.search}
        onChangeText={onSearch}
        autoCapitalize="none"
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10 }}
      />

      {isLoading && <ActivityIndicator />}
      {!isLoading && items.length === 0 && <Text style={{ color: colors.textMuted }}>{t.resource.empty}</Text>}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const row = renderRow(item);
          return (
            <Pressable
              onPress={() => onPressItem(item)}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>{row.title}</Text>
              {row.subtitle && <Text style={{ fontSize: 13, color: colors.textMuted }}>{row.subtitle}</Text>}
            </Pressable>
          );
        }}
      />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable disabled={page <= 1} onPress={() => onPageChange(page - 1)}>
          <Text style={{ color: page <= 1 ? colors.disabled : colors.accent }}>{t.resource.previous}</Text>
        </Pressable>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t.resource.pageOf(page, totalPages, total)}</Text>
        <Pressable disabled={page >= totalPages} onPress={() => onPageChange(page + 1)}>
          <Text style={{ color: page >= totalPages ? colors.disabled : colors.accent }}>{t.resource.next}</Text>
        </Pressable>
      </View>
    </View>
  );
}

import * as React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { colors } from "../theme";

export interface PickerOption {
  value: string;
  label: string;
}

interface PickerFieldProps {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}

/** A dependency-free tap-to-expand picker — React Native has no built-in <select>. */
export function PickerField({ label, value, options, onChange, placeholder }: PickerFieldProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 13, color: colors.textMuted }}>{label}</Text>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10 }}
      >
        <Text style={{ color: selected ? colors.navy : colors.textFaint }}>
          {selected?.label ?? placeholder ?? "Select…"}
        </Text>
      </Pressable>
      {open && (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, maxHeight: 220 }}>
          <ScrollView>
            {options.map((o) => (
              <Pressable
                key={o.value}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                <Text style={{ color: colors.navy }}>{o.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

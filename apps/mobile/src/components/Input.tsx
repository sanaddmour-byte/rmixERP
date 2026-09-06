import * as React from "react";
import { TextInput, type TextInputProps } from "react-native";
import { colors } from "../theme";

export function Input(props: TextInputProps) {
  return (
    <TextInput
      autoCapitalize="none"
      {...props}
      style={[{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10 }, props.style]}
    />
  );
}

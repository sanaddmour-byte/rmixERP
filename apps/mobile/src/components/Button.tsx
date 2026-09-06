import * as React from "react";
import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";
import { colors } from "../theme";

interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  label: string;
  variant?: "solid" | "outline" | "accent";
}

export function Button({ label, variant = "solid", disabled, ...props }: ButtonProps) {
  const bg = disabled ? colors.disabled : variant === "accent" ? colors.accent : variant === "outline" ? "transparent" : colors.navy;
  const borderColor = variant === "outline" ? (disabled ? colors.disabled : colors.navy) : "transparent";
  const textColor = variant === "outline" ? (disabled ? colors.disabled : colors.navy) : "#fff";

  return (
    <Pressable
      disabled={disabled}
      {...props}
      style={{
        backgroundColor: bg,
        borderWidth: variant === "outline" ? 1 : 0,
        borderColor,
        borderRadius: 6,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {disabled && label.endsWith("…") && <ActivityIndicator size="small" color={textColor} />}
      <Text style={{ color: textColor, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

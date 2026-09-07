import * as React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useLogin } from "@rmixerp/contract";
import { useLanguage } from "../src/i18n/LanguageContext";
import { setSession } from "../src/lib/session";

export default function LoginScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const login = useLogin();

  function handleSubmit() {
    setError(null);
    login.mutate(
      { data: { email, password } },
      {
        onSuccess: (result) => {
          if (result.status === 200) {
            void setSession(result.data.accessToken, result.data.refreshToken).then(() => {
              router.replace("/");
            });
            return;
          }
          setError(t.login.invalidCredentials);
        },
        onError: () => setError(t.login.invalidCredentials),
      },
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: "center" }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>{t.login.title}</Text>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: "#475569" }}>{t.login.email}</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{ borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 6, padding: 10 }}
        />
      </View>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: "#475569" }}>{t.login.password}</Text>
        <TextInput
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          style={{ borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 6, padding: 10 }}
        />
      </View>

      {error && <Text style={{ color: "#dc2626" }}>{error}</Text>}

      <Pressable
        onPress={handleSubmit}
        disabled={login.isPending}
        style={{ backgroundColor: "#0f172a", borderRadius: 6, padding: 12, alignItems: "center" }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>
          {login.isPending ? t.login.submitting : t.login.submit}
        </Text>
      </Pressable>
    </View>
  );
}

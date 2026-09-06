import * as React from "react";
import { I18nManager } from "react-native";
import * as SecureStore from "expo-secure-store";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, translations, type Locale, type Translations } from "@rmixerp/i18n";

interface LanguageContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Translations;
  setLocale: (locale: Locale) => void;
  /** True once the locale has been read back from storage. */
  ready: boolean;
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    SecureStore.getItemAsync(LOCALE_STORAGE_KEY)
      .then((stored) => {
        if (stored === "ar" || stored === "en") setLocaleState(stored);
      })
      .finally(() => setReady(true));
  }, []);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    void SecureStore.setItemAsync(LOCALE_STORAGE_KEY, next);
    // React Native's layout-direction flip (I18nManager.forceRTL) only
    // takes effect after the app restarts — this is a platform limitation,
    // not something we can work around. Text still renders correctly
    // right-to-left via Unicode bidi in the meantime; a full RTL layout
    // flip is picked up on next launch, matching the stored locale above.
    const isRTL = dirFor(next) === "rtl";
    if (I18nManager.isRTL !== isRTL) {
      I18nManager.allowRTL(isRTL);
      I18nManager.forceRTL(isRTL);
    }
  }, []);

  const value = React.useMemo<LanguageContextValue>(
    () => ({ locale, dir: dirFor(locale), t: translations[locale], setLocale, ready }),
    [locale, setLocale, ready],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}

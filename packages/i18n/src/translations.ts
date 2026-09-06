export type Locale = "en" | "ar";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "rmixerp-locale";

export interface Translations {
  appName: string;
  nav: { health: string; login: string };
  login: {
    title: string;
    email: string;
    password: string;
    submit: string;
    submitting: string;
    invalidCredentials: string;
    validationError: string;
    loggedInAs: (name: string) => string;
    logout: string;
  };
  health: {
    title: string;
    checking: string;
    ok: string;
    error: string;
    lastChecked: (time: string) => string;
  };
  languageToggle: string;
}

export const translations: Record<Locale, Translations> = {
  en: {
    appName: "RMC ERP",
    nav: { health: "System status", login: "Sign in" },
    login: {
      title: "Sign in",
      email: "Email",
      password: "Password",
      submit: "Sign in",
      submitting: "Signing in…",
      invalidCredentials: "Invalid email or password.",
      validationError: "Please check the fields above.",
      loggedInAs: (name) => `Signed in as ${name}`,
      logout: "Sign out",
    },
    health: {
      title: "System status",
      checking: "Checking…",
      ok: "All systems operational",
      error: "Could not reach the API",
      lastChecked: (time) => `Last checked ${time}`,
    },
    languageToggle: "العربية",
  },
  ar: {
    appName: "نظام رميكس",
    nav: { health: "حالة النظام", login: "تسجيل الدخول" },
    login: {
      title: "تسجيل الدخول",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      submit: "تسجيل الدخول",
      submitting: "جارٍ تسجيل الدخول…",
      invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      validationError: "يرجى التحقق من الحقول أعلاه.",
      loggedInAs: (name) => `تم تسجيل الدخول باسم ${name}`,
      logout: "تسجيل الخروج",
    },
    health: {
      title: "حالة النظام",
      checking: "جارٍ التحقق…",
      ok: "جميع الأنظمة تعمل بشكل طبيعي",
      error: "تعذر الوصول إلى واجهة البرمجة",
      lastChecked: (time) => `آخر تحقق ${time}`,
    },
    languageToggle: "English",
  },
};

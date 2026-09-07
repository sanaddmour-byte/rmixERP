export type Locale = "en" | "ar";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "rmixerp-locale";

export interface Translations {
  appName: string;
  nav: {
    health: string;
    login: string;
    company: string;
    branches: string;
    users: string;
    roles: string;
    customers: string;
    projects: string;
    products: string;
    priceLists: string;
    chargeTypes: string;
    rawMaterials: string;
    vendors: string;
    quotations: string;
    salesOrders: string;
    mixDesigns: string;
    inventory: string;
    productionOrders: string;
    qc: string;
    notifications: string;
    trucks: string;
    drivers: string;
    dispatch: string;
    myDeliveries: string;
    invoices: string;
  };
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
  resource: {
    new: string;
    create: string;
    save: string;
    edit: string;
    remove: string;
    search: string;
    exportCsv: string;
    loading: string;
    empty: string;
    previous: string;
    next: string;
    pageOf: (page: number, totalPages: number, total: number) => string;
    confirmRemove: string;
    notFound: string;
  };
  languageToggle: string;
}

export const translations: Record<Locale, Translations> = {
  en: {
    appName: "RMC ERP",
    nav: {
      health: "System status",
      login: "Sign in",
      company: "Company",
      branches: "Branches",
      users: "Users",
      roles: "Roles",
      customers: "Customers",
      projects: "Projects",
      products: "Products",
      priceLists: "Price Lists",
      chargeTypes: "Charge Types",
      rawMaterials: "Raw Materials",
      vendors: "Vendors",
      quotations: "Quotations",
      salesOrders: "Sales Orders",
      mixDesigns: "Mix Designs",
      inventory: "Inventory",
      productionOrders: "Production Orders",
      qc: "QC",
      notifications: "Notifications",
      trucks: "Trucks",
      drivers: "Drivers",
      dispatch: "Dispatch",
      myDeliveries: "My Deliveries",
      invoices: "Invoices",
    },
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
    resource: {
      new: "New",
      create: "Create",
      save: "Save",
      edit: "Edit",
      remove: "Remove",
      search: "Search…",
      exportCsv: "Export CSV",
      loading: "Loading…",
      empty: "No records yet.",
      previous: "Previous",
      next: "Next",
      pageOf: (page, totalPages, total) => `Page ${page} of ${totalPages} (${total} total)`,
      confirmRemove: "Remove this record?",
      notFound: "Record not found.",
    },
    languageToggle: "العربية",
  },
  ar: {
    appName: "نظام رميكس",
    nav: {
      health: "حالة النظام",
      login: "تسجيل الدخول",
      company: "الشركة",
      branches: "الفروع",
      users: "المستخدمون",
      roles: "الأدوار",
      customers: "العملاء",
      projects: "المشاريع",
      products: "المنتجات",
      priceLists: "قوائم الأسعار",
      chargeTypes: "أنواع الرسوم",
      rawMaterials: "المواد الخام",
      vendors: "الموردون",
      quotations: "عروض الأسعار",
      salesOrders: "أوامر البيع",
      mixDesigns: "تصاميم الخلطات",
      inventory: "المخزون",
      productionOrders: "أوامر الإنتاج",
      qc: "مراقبة الجودة",
      notifications: "الإشعارات",
      trucks: "الشاحنات",
      drivers: "السائقون",
      dispatch: "التوزيع",
      myDeliveries: "توصيلاتي",
      invoices: "الفواتير",
    },
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
    resource: {
      new: "جديد",
      create: "إنشاء",
      save: "حفظ",
      edit: "تعديل",
      remove: "حذف",
      search: "بحث…",
      exportCsv: "تصدير CSV",
      loading: "جارٍ التحميل…",
      empty: "لا توجد سجلات بعد.",
      previous: "السابق",
      next: "التالي",
      pageOf: (page, totalPages, total) => `صفحة ${page} من ${totalPages} (${total} إجمالي)`,
      confirmRemove: "هل تريد حذف هذا السجل؟",
      notFound: "لم يتم العثور على السجل.",
    },
    languageToggle: "English",
  },
};

export type Locale = "en" | "ar";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "rmixerp-locale";

export interface Translations {
  appName: string;
  nav: {
    home: string;
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
    purchaseRequests: string;
    purchaseOrders: string;
    goodsReceipts: string;
    vendorBills: string;
    payments: string;
    chartOfAccounts: string;
    glReports: string;
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
    clearanceQueue: string;
    collections: string;
    postDatedCheques: string;
    receivablesReports: string;
    customerStatement: string;
    reports: string;
    approvalsInbox: string;
    fleetAlerts: string;
    syncQueue: string;
    actionCenter: string;
  };
  navGroups: {
    approvals: string;
    sales: string;
    operations: string;
    quality: string;
    procurement: string;
    finance: string;
    reports: string;
    administration: string;
  };
  commandPalette: {
    title: string;
    placeholder: string;
    noResults: string;
  };
  actionCenterPage: {
    title: string;
    subtitle: string;
    empty: string;
    loading: string;
    severityHigh: string;
    severityMedium: string;
    creditBlockedTitle: string;
    creditBlockedDesc: (exposure: string, limit: string) => string;
    failedClearanceTitle: string;
    failedClearanceDesc: (docNumber: string) => string;
    bouncedChequeTitle: string;
    bouncedChequeDesc: (chequeNumber: string, bank: string) => string;
    failedQcTitle: string;
    failedQcDesc: (batchNumber: string) => string;
    pendingApprovalTitle: string;
    pendingApprovalDesc: (docNumber: string) => string;
    reviewAction: string;
    openAction: string;
  };
  home: {
    welcome: (name: string) => string;
    subtitle: string;
    systemStatus: string;
  };
  reportsHub: {
    title: string;
    subtitle: string;
    financeSection: string;
    operationsSection: string;
    agingTitle: string;
    creditControlTitle: string;
    creditOverridesTitle: string;
    customerStatementDesc: string;
    agingDesc: string;
    creditControlDesc: string;
    creditOverridesDesc: string;
    qcTraceabilityDesc: string;
    productionYieldDesc: string;
    glReportsDesc: string;
    openReport: string;
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
      home: "Home",
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
      purchaseRequests: "Purchase Requests",
      purchaseOrders: "Purchase Orders",
      goodsReceipts: "Goods Receipts",
      vendorBills: "Vendor Bills",
      payments: "Payments",
      chartOfAccounts: "Chart of Accounts",
      glReports: "GL Reports",
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
      clearanceQueue: "Clearance Queue",
      collections: "Collections",
      postDatedCheques: "Post-Dated Cheques",
      receivablesReports: "Receivables Reports",
      customerStatement: "Customer Statement",
      reports: "Reports",
      approvalsInbox: "Approvals Inbox",
      fleetAlerts: "Fleet Alerts",
      syncQueue: "Sync Queue",
      actionCenter: "Action Center",
    },
    navGroups: {
      approvals: "Approvals",
      sales: "Sales",
      operations: "Operations",
      quality: "Quality",
      procurement: "Procurement",
      finance: "Finance",
      reports: "Reports",
      administration: "Administration",
    },
    commandPalette: {
      title: "Quick navigation",
      placeholder: "Search for a module…",
      noResults: "No matches.",
    },
    actionCenterPage: {
      title: "Action Center",
      subtitle: "Exceptions across the business that need a decision — not a notification feed.",
      empty: "Nothing needs your attention right now.",
      loading: "Checking for exceptions…",
      severityHigh: "High",
      severityMedium: "Medium",
      creditBlockedTitle: "Customer credit exceeded",
      creditBlockedDesc: (exposure, limit) => `Exposure: ${exposure} JOD — Limit: ${limit} JOD`,
      failedClearanceTitle: "E-invoice failed",
      failedClearanceDesc: (docNumber) => `Document ${docNumber} could not be cleared.`,
      bouncedChequeTitle: "Returned cheque",
      bouncedChequeDesc: (chequeNumber, bank) => `Cheque ${chequeNumber} — ${bank}`,
      failedQcTitle: "Failed QC test",
      failedQcDesc: (batchNumber) => `Batch ${batchNumber} did not meet its design strength.`,
      pendingApprovalTitle: "Approval needed",
      pendingApprovalDesc: (docNumber) => `${docNumber} is waiting on your approval.`,
      reviewAction: "Review",
      openAction: "Open",
    },
    home: {
      welcome: (name) => `Welcome back, ${name}`,
      subtitle: "Jump into an application below.",
      systemStatus: "System status",
    },
    reportsHub: {
      title: "Reports",
      subtitle: "All reporting across modules, in one place.",
      financeSection: "Finance & Receivables",
      operationsSection: "Operations",
      agingTitle: "Aging",
      creditControlTitle: "Credit Control",
      creditOverridesTitle: "Credit Overrides",
      customerStatementDesc: "Running balance of a customer's invoices, credit notes, and collections.",
      agingDesc: "Outstanding receivables grouped by how overdue they are.",
      creditControlDesc: "Customer credit limits and current utilization.",
      creditOverridesDesc: "Sales/delivery orders that were approved despite a credit block.",
      qcTraceabilityDesc: "Cube-test results traced back to the batch and mix design that produced them.",
      productionYieldDesc: "Planned vs. actual yield variance for production orders.",
      glReportsDesc: "Trial balance, profit & loss, balance sheet, and cash flow.",
      openReport: "Open",
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
      home: "الرئيسية",
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
      purchaseRequests: "طلبات الشراء",
      purchaseOrders: "أوامر الشراء",
      goodsReceipts: "إيصالات الاستلام",
      vendorBills: "فواتير الموردين",
      payments: "المدفوعات",
      chartOfAccounts: "دليل الحسابات",
      glReports: "تقارير الحسابات العامة",
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
      clearanceQueue: "قائمة التخليص",
      collections: "التحصيلات",
      postDatedCheques: "الشيكات المؤجلة",
      receivablesReports: "تقارير الذمم المدينة",
      customerStatement: "كشف حساب العميل",
      reports: "التقارير",
      approvalsInbox: "صندوق الموافقات",
      fleetAlerts: "تنبيهات الأسطول",
      syncQueue: "قائمة المزامنة",
      actionCenter: "مركز الإجراءات",
    },
    navGroups: {
      approvals: "الموافقات",
      sales: "المبيعات",
      operations: "العمليات",
      quality: "الجودة",
      procurement: "المشتريات",
      finance: "المالية",
      reports: "التقارير",
      administration: "الإدارة",
    },
    commandPalette: {
      title: "التنقل السريع",
      placeholder: "ابحث عن وحدة…",
      noResults: "لا توجد نتائج مطابقة.",
    },
    actionCenterPage: {
      title: "مركز الإجراءات",
      subtitle: "استثناءات في الأعمال تتطلب قراراً — وليست قائمة إشعارات.",
      empty: "لا يوجد ما يتطلب اهتمامك الآن.",
      loading: "جاري التحقق من الاستثناءات…",
      severityHigh: "عالية",
      severityMedium: "متوسطة",
      creditBlockedTitle: "تجاوز العميل الحد الائتماني",
      creditBlockedDesc: (exposure, limit) => `المبلغ المستحق: ${exposure} د.أ — الحد: ${limit} د.أ`,
      failedClearanceTitle: "فشل تخليص الفاتورة الإلكترونية",
      failedClearanceDesc: (docNumber) => `تعذّر تخليص المستند ${docNumber}.`,
      bouncedChequeTitle: "شيك مرتجع",
      bouncedChequeDesc: (chequeNumber, bank) => `شيك ${chequeNumber} — ${bank}`,
      failedQcTitle: "فشل اختبار الجودة",
      failedQcDesc: (batchNumber) => `الدفعة ${batchNumber} لم تحقق قوة التصميم المطلوبة.`,
      pendingApprovalTitle: "موافقة مطلوبة",
      pendingApprovalDesc: (docNumber) => `${docNumber} في انتظار موافقتك.`,
      reviewAction: "مراجعة",
      openAction: "فتح",
    },
    home: {
      welcome: (name) => `مرحباً بعودتك، ${name}`,
      subtitle: "انتقل إلى أحد التطبيقات أدناه.",
      systemStatus: "حالة النظام",
    },
    reportsHub: {
      title: "التقارير",
      subtitle: "جميع التقارير عبر الوحدات، في مكان واحد.",
      financeSection: "المالية والذمم المدينة",
      operationsSection: "العمليات",
      agingTitle: "أعمار الديون",
      creditControlTitle: "ضبط الائتمان",
      creditOverridesTitle: "تجاوزات الائتمان",
      customerStatementDesc: "الرصيد الجاري لفواتير العميل وإشعارات الدائن والتحصيلات.",
      agingDesc: "الذمم المدينة المستحقة مجمعة حسب مدة التأخير.",
      creditControlDesc: "حدود ائتمان العملاء ونسبة الاستخدام الحالية.",
      creditOverridesDesc: "أوامر البيع أو التسليم التي تم اعتمادها رغم تجاوز حد الائتمان.",
      qcTraceabilityDesc: "نتائج اختبار المكعبات مربوطة بالدفعة وتصميم الخلطة اللذين أنتجاها.",
      productionYieldDesc: "الفرق بين الإنتاجية المخططة والفعلية لأوامر الإنتاج.",
      glReportsDesc: "ميزان المراجعة، الأرباح والخسائر، الميزانية العمومية، والتدفق النقدي.",
      openReport: "فتح",
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

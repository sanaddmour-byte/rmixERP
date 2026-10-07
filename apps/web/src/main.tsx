import "./lib/session";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { toast } from "@rmixerp/ui";
import { App } from "./App";
import { LanguageProvider } from "./i18n/LanguageContext";
import { ThemeProvider } from "./theme/ThemeContext";
import { reportIfMutationFailed } from "./lib/mutationErrorToast";
import "./index.css";

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: reportIfMutationFailed,
    // Genuine transport failures (offline, DNS, CORS) — the generated
    // client throws only for these, never for a documented error status
    // (see reportIfMutationFailed's doc comment).
    onError: (error) => toast.danger("Could not reach the server", error instanceof Error ? error.message : undefined),
  }),
});

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root element not found");
}

createRoot(container).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

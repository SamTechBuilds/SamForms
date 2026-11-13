import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ConfigMissingPage } from "@/pages/ConfigMissingPage";
import { isSupabaseConfigured } from "@/lib/supabase";
import "./index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider><App /></AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    ) : <ConfigMissingPage />}
  </StrictMode>,
);

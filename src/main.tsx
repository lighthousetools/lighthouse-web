import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { language } from "./i18n";
import { App } from "./shell/App";
import { applyLook } from "./shell/look";
import "./ui/tokens.css";
import "./ui/ui.css";
import "./shell/shell.css";

document.documentElement.lang = language();
applyLook();
const queries = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queries}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

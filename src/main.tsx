import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./ui/ErrorBoundary";

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = '<div style="color:#c2cebd;background:#080b08;padding:24px;font-family:monospace">Не найден #root в index.html</div>';
  throw new Error("missing #root");
}

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

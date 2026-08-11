import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { LanguageProvider } from "./i18n";
import "./index.css";

const routerBasename =
  import.meta.env.BASE_URL === "/" || import.meta.env.BASE_URL === "./"
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/$/, "");

document.documentElement.dataset.buildId = __BUILD_ID__;

// A tab kept open across a deployment can still hold an older entry bundle
// whose lazy chunk no longer exists. Vite exposes this exact failure before it
// reaches a React error boundary. Refresh once for this build so the browser
// receives the current no-cache HTML and its matching chunk names; if the same
// build fails again, let the normal local fallback render instead of looping.
const preloadRecoveryKey = `renshinkan-preload-recovery:${__BUILD_ID__}`;
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (sessionStorage.getItem(preloadRecoveryKey) === "1") return;
    sessionStorage.setItem(preloadRecoveryKey, "1");
  } catch {
    // Without a durable one-time marker, reloading could loop. Let the local
    // React error boundary render its normal retry fallback instead.
    return;
  }
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

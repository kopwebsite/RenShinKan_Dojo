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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

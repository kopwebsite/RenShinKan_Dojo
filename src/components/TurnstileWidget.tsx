import { useEffect, useRef, useState } from "react";
import { useTranslation, type TranslationKey } from "../i18n";

type WidgetSize = "flexible" | "compact";
type Api = {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
  reset(id: string): void;
};

declare global { interface Window { turnstile?: Api } }

let scriptPromise: Promise<Api> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    const script = existing || document.createElement("script");
    const finish = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile unavailable"));
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile failed")), { once: true });
    if (!existing) {
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
}

export function TurnstileWidget({ onToken, resetSignal = 0, action = "student-records" }: {
  onToken: (token: string) => void;
  resetSignal?: number;
  action?: "student-records" | "student-lookup" | "profile-request" | "exam-application" | "contribution";
}) {
  const { language, t } = useTranslation();
  const shell = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>();
  const widgetSize = useRef<WidgetSize>();
  const callback = useRef(onToken);
  const initialReset = useRef(true);
  const [size, setSize] = useState<WidgetSize>("flexible");
  const [messageKey, setMessageKey] = useState<TranslationKey>("turnstile.loading");
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  useEffect(() => { callback.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!siteKey || !shell.current || !container.current) return;
    let cancelled = false;
    let api: Api | null = null;

    const render = (nextSize: WidgetSize) => {
      if (cancelled || !api || !container.current || widgetSize.current === nextSize) return;
      if (widgetId.current) api.remove(widgetId.current);
      container.current.replaceChildren();
      widgetId.current = undefined;
      widgetSize.current = nextSize;
      callback.current("");
      setSize(nextSize);
      setMessageKey("turnstile.loading");
      widgetId.current = api.render(container.current, {
        sitekey: siteKey,
        action,
        size: nextSize,
        theme: "auto",
        language: language === "zh-CN" ? "zh-cn" : language,
        appearance: "interaction-only",
        "response-field": false,
        "feedback-enabled": true,
        callback: (token: string) => { callback.current(token); setMessageKey("turnstile.complete"); },
        "before-interactive-callback": () => setMessageKey("turnstile.completeCheck"),
        "after-interactive-callback": () => setMessageKey("turnstile.checking"),
        "expired-callback": () => { callback.current(""); setMessageKey("turnstile.expired"); },
        "timeout-callback": () => { callback.current(""); setMessageKey("turnstile.timedOut"); },
        "error-callback": () => { callback.current(""); setMessageKey("turnstile.retry"); },
      });
      if (widgetId.current) setMessageKey("turnstile.ready");
    };

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width || shell.current?.clientWidth || 0;
      if (width > 0) render(width < 300 ? "compact" : "flexible");
    });

    loadTurnstile().then((loaded) => {
      if (cancelled || !shell.current) return;
      api = loaded;
      observer.observe(shell.current);
      render(shell.current.clientWidth < 300 ? "compact" : "flexible");
    }).catch(() => setMessageKey("turnstile.refresh"));

    return () => {
      cancelled = true;
      observer.disconnect();
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
      widgetSize.current = undefined;
    };
  }, [action, language, siteKey]);

  useEffect(() => {
    if (initialReset.current) { initialReset.current = false; return; }
    callback.current("");
    setMessageKey("turnstile.ready");
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [resetSignal]);

  if (!siteKey) return <p className="form-error">{t("turnstile.notConfigured")}</p>;
  return <div ref={shell} className="turnstile-shell" data-size={size}>
    <div ref={container} className="turnstile-frame" data-action={action} role="group" aria-label={t("turnstile.label")} />
    <p className="turnstile-status" aria-live="polite">{t(messageKey)}</p>
  </div>;
}

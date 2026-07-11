import { useEffect, useRef } from "react";

type Api = { render(element: HTMLElement, options: Record<string, unknown>): string; remove(id: string): void; reset(id: string): void };
declare global { interface Window { turnstile?: Api } }
let scriptPromise: Promise<Api> | null = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    const script = existing || document.createElement("script");
    const finish = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile unavailable"));
    script.addEventListener("load", finish, { once: true }); script.addEventListener("error", () => reject(new Error("Turnstile failed")), { once: true });
    if (!existing) { script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; script.defer = true; document.head.appendChild(script); }
  });
  return scriptPromise;
}

export function TurnstileWidget({ onToken, resetSignal = 0 }: { onToken: (token: string) => void; resetSignal?: number }) {
  const container = useRef<HTMLDivElement>(null); const widgetId = useRef<string>();
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  useEffect(() => { if (!siteKey || !container.current) return; let cancelled = false; loadTurnstile().then((api) => { if (!cancelled && container.current && !widgetId.current) widgetId.current = api.render(container.current, { sitekey: siteKey, callback: onToken, "expired-callback": () => onToken(""), "error-callback": () => onToken("") }); }).catch(() => onToken("")); return () => { cancelled = true; if (widgetId.current) { window.turnstile?.remove(widgetId.current); widgetId.current = undefined; } }; }, [onToken, siteKey]);
  useEffect(() => { if (widgetId.current) window.turnstile?.reset(widgetId.current); }, [resetSignal]);
  if (!siteKey) return <p className="form-error">Cloudflare verification is not configured.</p>;
  return <div ref={container} className="turnstile-frame" aria-label="Cloudflare human verification" />;
}

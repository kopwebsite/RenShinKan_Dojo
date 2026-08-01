import { formatGregorianDateTime } from "../../../shared/date";

export async function adminApi<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET") headers.set("X-Request-ID", crypto.randomUUID());
  const response = await fetch(url, { ...options, headers, credentials: "include", cache: "no-store" });
  const body = (response.status === 204
    ? {}
    : await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    if (response.status === 401 && url !== "/api/admin/login") {
      window.dispatchEvent(new CustomEvent("admin-session-invalid"));
    }
    throw new Error(body.error || "The request could not be completed.");
  }
  return body;
}

export function formatAdminDate(value: string | null) {
  return formatGregorianDateTime(value, "—");
}

export function adminStatusLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

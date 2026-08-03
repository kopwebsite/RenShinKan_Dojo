// @vitest-environment jsdom
import { act, createElement, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "../src/components/admin/AdminShell";
import { AccessibleDialog } from "../src/components/AccessibleDialog";
import {
  AdminSessionProvider,
  useAdminSession,
} from "../src/components/admin/useAdminSession";
import { AdminLanguageProvider } from "../src/i18n";
import {
  adminRouteAccess,
  canAccessAdminPath,
} from "../shared/adminPermissions";
import { namesLikelyMatch } from "../functions/_lib/studentRecords";
import {
  normalizeIpAddress,
  trustedClientIp,
} from "../functions/_lib/requestIdentity";
import { consumeRateLimit } from "../functions/_lib/rateLimit";
import {
  publishEditableContent,
  reconcileEditableContentPublish,
  RecoverablePublishError,
} from "../functions/_lib/publishing";
import {
  activateEditableContentVersion,
  emptyContent,
  readEditableContentFromStorage,
  writeEditableContentVersion,
} from "../functions/_lib/storage";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: ReactNode) {
  const container = document.createElement("div");
  if (!document.getElementById("root")) container.id = "root";
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(node));
  return container;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    act(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("authoritative administrator session runtime", () => {
  it("makes one delayed bootstrap request and never flashes a protected child", async () => {
    let complete!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const container = mount(
      createElement(
        MemoryRouter,
        { initialEntries: ["/admin/students"] },
        createElement(
          AdminLanguageProvider,
          null,
          createElement(
            AdminSessionProvider,
            null,
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: "/admin",
                element: createElement("p", null, "Login boundary"),
              }),
              createElement(Route, {
                path: "/admin/students",
                element: createElement(
                  AdminShell,
                  null,
                  createElement("p", null, "PRIVATE STUDENT CONTENT"),
                ),
              }),
            ),
          ),
        ),
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/session");
    expect(container.textContent).not.toContain("PRIVATE STUDENT CONTENT");
    await act(async () =>
      complete(
        new Response(
          JSON.stringify({ authenticated: false, admin: null, dojos: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    await flush();
    expect(container.textContent).toContain("Login boundary");
    expect(container.textContent).not.toContain("PRIVATE STUDENT CONTENT");
  });

  it("leaves loading with a clear retry state when bootstrap fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network unavailable")),
    );
    const container = mount(
      createElement(
        MemoryRouter,
        { initialEntries: ["/admin/students"] },
        createElement(
          AdminLanguageProvider,
          null,
          createElement(
            AdminSessionProvider,
            null,
            createElement(
              AdminShell,
              null,
              createElement("p", null, "PRIVATE STUDENT CONTENT"),
            ),
          ),
        ),
      ),
    );
    await flush();
    expect(container.textContent).toContain(
      "Administrator session unavailable",
    );
    expect(container.textContent).toContain("Retry");
    expect(container.textContent).not.toContain("PRIVATE STUDENT CONTENT");
  });

  it("shares the bootstrap across consumers and logout clears every consumer", async () => {
    const fetchMock = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url === "/api/admin/session"
              ? {
                  authenticated: true,
                  admin: {
                    name: "Server identity",
                    role: "dojo",
                    allowedDojoIds: ["dojo-a"],
                    selectedDojoId: "dojo-a",
                    permissionLevel: "dojo_admin",
                    renshinkanVerificationRequired: false,
                  },
                  dojos: [],
                }
              : { ok: true },
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    function Probe({ id }: { id: string }) {
      const session = useAdminSession();
      return createElement(
        "div",
        null,
        createElement(
          "span",
          null,
          `${id}:${session.admin?.name || session.status}`,
        ),
        createElement(
          "button",
          { onClick: () => void session.logout() },
          "logout",
        ),
      );
    }
    const container = mount(
      createElement(
        MemoryRouter,
        { initialEntries: ["/admin/students"] },
        createElement(
          AdminSessionProvider,
          null,
          createElement(Probe, { id: "one" }),
          createElement(Probe, { id: "two" }),
        ),
      ),
    );
    await flush();
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/admin/session"),
    ).toHaveLength(1);
    expect(container.textContent).toContain("one:Server identity");
    await act(async () =>
      container
        .querySelector("button")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await flush();
    expect(container.textContent).toContain("one:unauthenticated");
    expect(container.textContent).toContain("two:unauthenticated");
  });
});

describe("accessible overlay runtime", () => {
  it("traps focus, closes with Escape, restores focus, locks scroll, and makes the app inert", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const trigger = useRef<HTMLButtonElement>(null);
      return createElement(
        "div",
        null,
        createElement(
          "button",
          { ref: trigger, onClick: () => setOpen(true) },
          "Open dialog",
        ),
        createElement(
          AccessibleDialog,
          {
            open,
            onClose: () => setOpen(false),
            triggerRef: trigger,
            titleId: "dialog-title",
          },
          createElement("h2", { id: "dialog-title" }, "Secure action"),
          createElement("button", null, "First action"),
          createElement("button", null, "Last action"),
        ),
      );
    }
    const container = mount(createElement(Harness));
    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => trigger.click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const buttons = dialog.querySelectorAll("button");
    expect(document.getElementById("root")?.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(buttons[0]);
    buttons[1].focus();
    buttons[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () =>
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.getElementById("root")?.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });
});

describe("route, identity, lookup, and storage security", () => {
  it("defaults unknown admin routes to deny and centralizes wildcard protection", () => {
    expect(adminRouteAccess("/admin/galleries/achievements")).toBe("central");
    expect(
      canAccessAdminPath("/admin/galleries/achievements", "dojo_admin"),
    ).toBe(false);
    expect(
      canAccessAdminPath(
        "/admin/galleries/achievements",
        "renshinkan_super_admin",
      ),
    ).toBe(true);
    expect(adminRouteAccess("/admin/future-privileged-console")).toBe("deny");
    expect(canAccessAdminPath("/admin/audit", "dojo_admin")).toBe(false);
  });

  it("normalizes trusted IPv4 and IPv6 while ignoring spoofable forwarding headers", () => {
    expect(normalizeIpAddress("192.168.001.1")).toBe("192.168.1.1");
    expect(normalizeIpAddress("2001:0db8::1")).toBe("2001:db8:0:0:0:0:0:1");
    expect(
      trustedClientIp(
        new Request("https://example.test", {
          headers: {
            "CF-Ray": "abc-SIN",
            "CF-Connecting-IP": "2001:db8::1",
            "X-Forwarded-For": "1.2.3.4",
          },
        }),
      ),
    ).toBe("2001:db8:0:0:0:0:0:1");
    expect(
      trustedClientIp(
        new Request("https://example.test", {
          headers: {
            "CF-Connecting-IP": "1.2.3.4",
            "X-Forwarded-For": "5.6.7.8",
          },
        }),
      ),
    ).toBeNull();
  });

  it("matches normalized full names exactly without an extra student credential", () => {
    expect(namesLikelyMatch(" สมชาย   ใจดี ", "สมชาย ใจดี")).toBe(true);
    expect(namesLikelyMatch("ＳＯＭＣＨＡＩ", "somchai")).toBe(true);
    expect(namesLikelyMatch("สมชาย", "สมชาย ใจดี")).toBe(false);
  });

  it("fails closed for missing, malformed, and unavailable versioned content", async () => {
    await expect(readEditableContentFromStorage({})).rejects.toThrow(
      "CONTENT_KV binding",
    );
    await expect(
      readEditableContentFromStorage({
        CONTENT_KV: {
          get: async () => {
            throw new Error("secret upstream detail");
          },
          put: async () => undefined,
        },
      }),
    ).rejects.toThrow("temporarily unavailable");
    await expect(
      readEditableContentFromStorage({
        CONTENT_KV: { get: async () => "not-json", put: async () => undefined },
      }),
    ).rejects.toThrow("malformed");
    const values = new Map<string, string>();
    const kv = {
      get: async (key: string) => values.get(key) ?? null,
      put: async (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const content = emptyContent();
    const payloadKey = "site:editable-content:version:1:0123456789abcdef";
    await writeEditableContentVersion(
      { CONTENT_KV: kv },
      payloadKey,
      JSON.stringify(content),
      content,
    );
    await activateEditableContentVersion(
      { CONTENT_KV: kv },
      payloadKey,
      "operation-1",
    );
    expect(
      (await readEditableContentFromStorage({ CONTENT_KV: kv })).version,
    ).toBe(content.version);
    values.delete(payloadKey);
    await expect(
      readEditableContentFromStorage({ CONTENT_KV: kv }),
    ).rejects.toThrow("version is missing");
  });
});

describe("layered rate limiting", () => {
  it("does not reset when User-Agent or X-Forwarded-For changes", async () => {
    const rows = new Map<
      string,
      {
        window_started_at: string;
        attempts: number;
        locked_until: string | null;
      }
    >();
    const db = {
      prepare(query: string) {
        let bindings: unknown[] = [];
        return {
          bind(...values: unknown[]) {
            bindings = values;
            return this;
          },
          async first<T>() {
            if (query.includes("INSERT INTO security_rate_limits")) {
              const key = `${bindings[0]}:${bindings[1]}`;
              const existing = rows.get(key);
              const now = String(bindings[5]);
              const cutoff = String(bindings[6]);
              let next: {
                window_started_at: string;
                attempts: number;
                locked_until: string | null;
              };
              if (!existing || existing.window_started_at <= cutoff) {
                next = {
                  window_started_at: String(bindings[2]),
                  attempts: 1,
                  locked_until: null,
                };
              } else if (existing.locked_until && existing.locked_until > now) {
                next = existing;
              } else {
                const attempts = existing.attempts + 1;
                next = {
                  ...existing,
                  attempts,
                  locked_until:
                    attempts > Number(bindings[11])
                      ? String(bindings[20])
                      : null,
                };
              }
              rows.set(key, next);
              return next as T;
            }
            return (rows.get(`${bindings[0]}:${bindings[1]}`) ||
              null) as T | null;
          },
          async run() {
            if (
              query.includes(
                "DELETE FROM security_rate_limits WHERE expires_at",
              )
            )
              return { success: true };
            return { success: true };
          },
        };
      },
    };
    const env = {
      STUDENT_DB: db,
      SESSION_SECRET: "test-only-rate-limit-secret",
    };
    const request = (agent: string, forwarded: string) =>
      new Request("https://example.test/api", {
        headers: {
          "CF-Ray": "abc-SIN",
          "CF-Connecting-IP": "203.0.113.8",
          "User-Agent": agent,
          "X-Forwarded-For": forwarded,
        },
      });
    const rule = {
      endpoint: "test",
      limit: 2,
      windowSeconds: 900,
      lockSeconds: 60,
    };
    expect(await consumeRateLimit(request("one", "1.1.1.1"), env, rule)).toBe(
      true,
    );
    expect(await consumeRateLimit(request("two", "2.2.2.2"), env, rule)).toBe(
      true,
    );
    expect(await consumeRateLimit(request("three", "3.3.3.3"), env, rule)).toBe(
      false,
    );
  });
});

type PublishFault = "reserve" | "version" | "confirm" | "pointer" | null;

function publishingHarness(initialFault: PublishFault) {
  let fault = initialFault;
  const kvValues = new Map<string, string>();
  const operations = new Map<string, Record<string, unknown>>();
  const revisions = new Map<number, string>();

  function prepare(query: string) {
    let bindings: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        bindings = values;
        return statement;
      },
      async first<T>() {
        if (query.includes("INSERT INTO security_rate_limits")) {
          return {
            window_started_at: bindings[2],
            attempts: 1,
            locked_until: null,
          } as T;
        }
        if (query.includes("security_rate_limits")) return null;
        if (query.includes("idempotency_key = ?")) {
          return ([...operations.values()].find(
            (operation) => operation.idempotency_key === bindings[0],
          ) || null) as T | null;
        }
        if (query.includes("SELECT MAX(value)")) {
          return { next_number: revisions.size + operations.size + 1 } as T;
        }
        if (query.includes("site_revisions WHERE revision_number")) {
          const revision = revisions.get(Number(bindings[0]));
          return (revision ? { id: revision } : null) as T | null;
        }
        if (query.includes("publish_operations WHERE id = ?")) {
          return (operations.get(String(bindings[0])) || null) as T | null;
        }
        return null;
      },
      async all<T>() {
        return { success: true, results: [] as T[] };
      },
      async run() {
        if (query.includes("INSERT INTO security_rate_limits")) {
          return { success: true, meta: { changes: 1 } };
        }
        if (query.includes("INSERT INTO publish_operations")) {
          if (fault === "reserve") throw new Error("reserve unavailable");
          operations.set(String(bindings[0]), {
            id: bindings[0],
            idempotency_key: bindings[1],
            revision_number: Number(bindings[2]),
            status: "publishing",
            stage: "reserved",
            payload_key: bindings[3],
            payload_sha256: bindings[4],
          });
        } else if (query.includes("INSERT INTO site_revisions")) {
          revisions.set(Number(bindings[1]), String(bindings[0]));
        } else if (query.includes("status = 'failed'")) {
          const operation = operations.get(String(bindings[3]));
          if (operation)
            Object.assign(operation, { status: "failed", stage: bindings[0] });
        } else if (query.includes("stage = 'kv_version_written'")) {
          const operation = operations.get(String(bindings[1]));
          if (operation)
            Object.assign(operation, {
              status: "publishing",
              stage: "kv_version_written",
            });
        } else if (query.includes("stage = 'd1_confirmed'")) {
          const operation = [...operations.values()][0];
          if (operation)
            Object.assign(operation, {
              status: "published",
              stage: "d1_confirmed",
            });
        } else if (query.includes("stage = 'complete'")) {
          const operation = operations.get(String(bindings[1]));
          if (operation)
            Object.assign(operation, {
              status: "published",
              stage: "complete",
            });
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return statement;
  }

  const db = {
    prepare,
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      if (fault === "confirm") throw new Error("confirmation unavailable");
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
  const kv = {
    async get(key: string) {
      return kvValues.get(key) || null;
    },
    async put(key: string, value: string) {
      if (fault === "version" && key.includes(":version:"))
        throw new Error("version unavailable");
      if (fault === "pointer" && key.endsWith(":published-version"))
        throw new Error("pointer unavailable");
      kvValues.set(key, value);
    },
  };
  return {
    db,
    kv,
    kvValues,
    operations,
    revisions,
    setFault(value: PublishFault) {
      fault = value;
    },
  };
}

function publishInput(harness: ReturnType<typeof publishingHarness>) {
  return {
    env: {
      CONTENT_KV: harness.kv,
      SESSION_SECRET: "publish-test-secret",
    },
    db: harness.db,
    request: new Request("https://example.test/api/admin/site-content", {
      method: "POST",
      headers: {
        "CF-Ray": "publish-SIN",
        "CF-Connecting-IP": "203.0.113.40",
        "X-Request-ID": "publish-test-request",
      },
    }),
    session: {
      sub: "admin" as const,
      iat: 1,
      exp: 9_999_999_999,
      sessionId: "publish-session",
      accountId: "publish-account",
      adminName: "Server administrator",
      role: "central" as const,
      allowedDojoIds: [],
      selectedDojoId: "dojo-rsk",
    },
    content: emptyContent(),
    action: "site_content_published",
    source: "hardening_test",
  };
}

describe("recoverable publishing state machine", () => {
  it("never writes public storage when D1 reservation fails", async () => {
    const harness = publishingHarness("reserve");
    await expect(
      publishEditableContent(publishInput(harness) as never),
    ).rejects.toThrow("reserve unavailable");
    expect(harness.kvValues.size).toBe(0);
    expect(harness.operations.size).toBe(0);
  });

  it("records a failed operation when the immutable version write fails", async () => {
    const harness = publishingHarness("version");
    await expect(
      publishEditableContent(publishInput(harness) as never),
    ).rejects.toMatchObject({
      stage: "versioned storage write",
    });
    expect([...harness.operations.values()][0]).toMatchObject({
      status: "failed",
      stage: "kv_version_write",
    });
    expect(harness.revisions.size).toBe(0);
  });

  it("does not activate KV when D1 confirmation fails", async () => {
    const harness = publishingHarness("confirm");
    await expect(
      publishEditableContent(publishInput(harness) as never),
    ).rejects.toBeInstanceOf(RecoverablePublishError);
    expect(
      harness.kvValues.has("site:editable-content:published-version"),
    ).toBe(false);
    expect([...harness.operations.values()][0]).toMatchObject({
      status: "failed",
      stage: "d1_confirmation",
    });
  });

  it("reconciles a confirmed D1 revision after pointer activation fails", async () => {
    const harness = publishingHarness("pointer");
    let operationId = "";
    try {
      await publishEditableContent(publishInput(harness) as never);
    } catch (error) {
      expect(error).toBeInstanceOf(RecoverablePublishError);
      operationId = (error as RecoverablePublishError).operationId;
    }
    expect(operationId).not.toBe("");
    expect(harness.revisions.size).toBe(1);
    expect(
      harness.kvValues.has("site:editable-content:published-version"),
    ).toBe(false);
    harness.setFault(null);
    await reconcileEditableContentPublish({
      env: { CONTENT_KV: harness.kv },
      db: harness.db,
      operationId,
    } as never);
    expect(
      harness.kvValues.has("site:editable-content:published-version"),
    ).toBe(true);
    expect(harness.operations.get(operationId)).toMatchObject({
      status: "published",
      stage: "complete",
    });
  });
});

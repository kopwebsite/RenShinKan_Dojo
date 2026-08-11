// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HelpLauncher } from "../src/help/HelpLauncher";
import { AdminLanguageProvider, LanguageProvider } from "../src/i18n";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeAll(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, String(value)),
      get length() {
        return values.size;
      },
      key: (index: number) => [...values.keys()][index] ?? null,
    },
  });
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

async function waitFor(check: () => boolean, message: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await settle();
  }
  throw new Error(message);
}

beforeEach(() => {
  localStorage.clear();
  history.replaceState({}, "", "/");
  container = document.createElement("div");
  container.id = "root";
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("help launcher runtime", () => {
  it("opens a modal dialog, traps initial focus, closes on Escape, and restores focus", async () => {
    await act(async () =>
      root.render(
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <LanguageProvider>
            <HelpLauncher audience="public" />
          </LanguageProvider>
        </BrowserRouter>,
      ),
    );
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Open website help"]',
    )!;
    await act(async () => trigger.click());
    await waitFor(
      () => Boolean(document.getElementById("public-help-title")),
      "Public help panel did not finish loading",
    );
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.getElementById("root")?.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    await waitFor(
      () => !document.querySelector('[role="dialog"]'),
      "Help dialog did not close after Escape",
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.getElementById("root")?.hasAttribute("inert")).toBe(false);
  });

  it("removes a guide deep link when the dialog closes", async () => {
    history.replaceState({}, "", "/student-records?help=public-exam-application");
    await act(async () =>
      root.render(
        <BrowserRouter>
          <LanguageProvider>
            <HelpLauncher audience="public" />
          </LanguageProvider>
        </BrowserRouter>,
      ),
    );
    await waitFor(
      () => Boolean(document.getElementById("public-help-title")),
      "Deep-linked help panel did not finish loading",
    );
    const close = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Close help"]',
    )!;
    await act(async () => close.click());
    await waitFor(
      () => !document.querySelector('[role="dialog"]'),
      "Deep-linked help panel did not close",
    );
    expect(window.location.search).toBe("");
  });

  it("uses complete Thai UI copy and Thai search without a DOM translation adapter", async () => {
    localStorage.setItem("rsk-lang", "th");
    await act(async () =>
      root.render(
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <LanguageProvider>
            <HelpLauncher audience="public" />
          </LanguageProvider>
        </BrowserRouter>,
      ),
    );
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-label="เปิดคู่มือเว็บไซต์"]',
    )!;
    await act(async () => trigger.click());
    await waitFor(
      () => Boolean(document.querySelector('input[type="search"]')),
      "Thai help panel did not finish loading",
    );
    const search = document.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    await act(async () => {
      const InputElement = search.ownerDocument.defaultView!.HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        InputElement.prototype,
        "value",
      )!.set!;
      setter.call(search, "โปรไฟล์");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitFor(
      () =>
        document.body.textContent?.includes(
          "สร้างโปรไฟล์นักเรียนใหม่อย่างไร?",
        ) === true,
      "Thai search results did not update",
    );
    expect(document.body.textContent).toContain(
      "สร้างโปรไฟล์นักเรียนใหม่อย่างไร?",
    );
    expect(document.body.textContent).toMatch(/พบ \d+ หัวข้อ/);
  });

  it("names and describes the concise admin guide accurately", async () => {
    await act(async () =>
      root.render(
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <LanguageProvider>
            <AdminLanguageProvider>
              <HelpLauncher audience="admin" />
            </AdminLanguageProvider>
          </LanguageProvider>
        </BrowserRouter>,
      ),
    );
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Open admin help"]',
    )!;
    expect(trigger.textContent).toContain("Admin help");
    await act(async () => trigger.click());
    await waitFor(
      () => Boolean(document.getElementById("admin-help-title")),
      "Admin help panel did not finish loading",
    );
    expect(
      document
        .querySelector('[role="dialog"]')
        ?.getAttribute("aria-labelledby"),
    ).toBe("admin-help-title");
    expect(document.body.textContent).toContain("How to use administration");
    expect(document.body.textContent).toContain(
      "Choose a task and follow the short steps.",
    );
  });
});

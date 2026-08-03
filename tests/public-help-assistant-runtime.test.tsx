// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter } from "react-router";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { HelpLauncher } from "../src/help/HelpLauncher";
import { LanguageProvider } from "../src/i18n";

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
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
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

async function typeIn(input: HTMLInputElement, value: string) {
  await act(async () => {
    const InputElement = input.ownerDocument.defaultView!.HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      InputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function openHelp() {
  const trigger = document.querySelector<HTMLButtonElement>(".help-launcher")!;
  await act(async () => trigger.click());
  await waitFor(
    () => Boolean(document.querySelector('input[type="search"]')),
    "Public help panel did not load",
  );
}

beforeEach(() => {
  localStorage.clear();
  history.replaceState({}, "", "/records/share/secret-route-token?private=yes");
  container = document.createElement("div");
  container.id = "root";
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("public help assistant runtime", () => {
  it("uses the existing launcher and opens the approved guide returned by ID", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ outcome: "match", topicId: "public-passport" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await act(async () =>
      root.render(
        <BrowserRouter>
          <LanguageProvider>
            <HelpLauncher audience="public" />
          </LanguageProvider>
        </BrowserRouter>,
      ),
    );
    expect(document.querySelectorAll(".help-launcher")).toHaveLength(1);
    await openHelp();
    const input = document.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    expect(input.maxLength).toBe(500);
    await typeIn(input, "How do I see my student passport?");
    const ask = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Ask website assistant")!;
    await act(async () => ask.click());
    await waitFor(
      () => document.body.textContent?.includes("Find my passport") === true,
      "Assistant did not open the approved guide",
    );
    expect(document.body.textContent).toContain(
      "How do I see my student passport?",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/help/ai");
    expect(JSON.parse(String(options.body))).toEqual({
      question: "How do I see my student passport?",
      locale: "en",
    });
    expect(String(options.body)).not.toContain("secret-route-token");
    expect(options).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  });

  it("renders fixed fallback copy and never renders response prose", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          outcome: "unknown",
          message: "MALICIOUS MODEL PROSE",
        }),
      ),
    );
    await act(async () =>
      root.render(
        <BrowserRouter>
          <LanguageProvider>
            <HelpLauncher audience="public" />
          </LanguageProvider>
        </BrowserRouter>,
      ),
    );
    await openHelp();
    await typeIn(
      document.querySelector<HTMLInputElement>('input[type="search"]')!,
      "Unrelated request",
    );
    const ask = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Ask website assistant")!;
    await act(async () => ask.click());
    await waitFor(
      () =>
        document.body.textContent?.includes(
          "The assistant is unavailable. The public guides below still work.",
        ) === true,
      "Fixed fallback copy did not appear",
    );
    expect(document.body.textContent).not.toContain("MALICIOUS MODEL PROSE");
  });

  it("sends Thai only when Thai is active and keeps other locales static", async () => {
    localStorage.setItem("rsk-lang", "th");
    const fetchMock = vi.fn(async () => Response.json({ outcome: "unknown" }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () =>
      root.render(
        <BrowserRouter>
          <LanguageProvider>
            <HelpLauncher audience="public" />
          </LanguageProvider>
        </BrowserRouter>,
      ),
    );
    await openHelp();
    await typeIn(
      document.querySelector<HTMLInputElement>('input[type="search"]')!,
      "คำถามเกี่ยวกับเว็บไซต์",
    );
    expect(
      document.querySelector<HTMLInputElement>('input[type="search"]')!
        .maxLength,
    ).toBe(500);
    const ask = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "ถามผู้ช่วยเว็บไซต์")!;
    await act(async () => ask.click());
    await waitFor(
      () => fetchMock.mock.calls.length === 1,
      "Thai request missing",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      question: "คำถามเกี่ยวกับเว็บไซต์",
      locale: "th",
    });
  });

  it("keeps the assistant hidden outside the supported English and Thai locales", async () => {
    localStorage.setItem("rsk-lang", "ja");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await act(async () =>
      root.render(
        <BrowserRouter>
          <LanguageProvider>
            <HelpLauncher audience="public" />
          </LanguageProvider>
        </BrowserRouter>,
      ),
    );
    await openHelp();
    expect(document.querySelector(".help-assistant")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

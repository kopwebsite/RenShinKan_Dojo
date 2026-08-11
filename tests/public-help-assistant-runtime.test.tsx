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
import {
  emptyPublicHelpMemory,
  PUBLIC_HELP_CHAT_STORAGE_KEY,
} from "../src/help/publicAssistant";
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

function response(
  reply: string,
  overrides: Partial<{
    locale: "en" | "th";
    mode: "general" | "guided" | "personal-unavailable" | "privacy-refusal";
    links: Array<{ label: string; href: string }>;
    memory: ReturnType<typeof emptyPublicHelpMemory>;
  }> = {},
) {
  const locale = overrides.locale || "en";
  return {
    outcome: "answer",
    reply,
    mode: overrides.mode || "general",
    links: overrides.links || [],
    memory: overrides.memory || emptyPublicHelpMemory(locale),
  };
}

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

async function setInputValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    const Element =
      input instanceof HTMLTextAreaElement
        ? input.ownerDocument.defaultView!.HTMLTextAreaElement
        : input.ownerDocument.defaultView!.HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      Element.prototype,
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
    () => Boolean(document.getElementById("public-help-message")),
    "Public chat did not load",
  );
}

async function send(value: string) {
  const composer = document.getElementById(
    "public-help-message",
  ) as HTMLTextAreaElement;
  await setInputValue(composer, value);
  await act(async () => {
    composer.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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

describe("public help chatbot runtime", () => {
  it("opens one accessible chat with a short welcome, focused composer, privacy details, and static guides", async () => {
    vi.stubGlobal("fetch", vi.fn());
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
    expect(document.getElementById("public-help-title")?.textContent).toBe(
      "Ask Auggie",
    );
    expect(document.body.textContent).toContain("How can I help?");
    expect(document.body.textContent).toContain("Not sure what to ask?");
    expect(document.activeElement).toBe(
      document.getElementById("public-help-message"),
    );
    expect(
      document.querySelector('[role="log"]')?.getAttribute("aria-live"),
    ).toBe("polite");
    const privacy = document.querySelector<HTMLDetailsElement>(
      ".public-help-privacy",
    )!;
    expect(privacy.open).toBe(false);
    expect(privacy.textContent).toContain("sent to the AI service");
    expect(privacy.textContent).toContain(
      "cannot read student or administration records",
    );
    expect(document.querySelector(".public-help-guides")).not.toBeNull();
    expect(document.querySelector('input[type="search"]')).not.toBeNull();
  });

  it("sends bounded safe page context and preserves multi-turn memory across English and Thai", async () => {
    const firstMemory = {
      ...emptyPublicHelpMemory("en"),
      topic: "First visit",
      workflow: "first-visit" as const,
      draft: { ...emptyPublicHelpMemory("en").draft, visitDay: "Saturday" },
    };
    const secondMemory = { ...firstMemory, language: "th" as const };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          response("Yes. Beginners can join. What would you like to know?", {
            memory: firstMemory,
            links: [
              { label: "First visit guide", href: "/classes#first-visit" },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          response("ใส่เสื้อผ้าที่เคลื่อนไหวสะดวกและมาถึงก่อนเวลาเล็กน้อย", {
            locale: "th",
            memory: secondMemory,
          }),
        ),
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
    await openHelp();
    await send("I'm new to aikido. Can I join this Saturday?");
    await waitFor(
      () => document.body.textContent?.includes("Beginners can join") === true,
      "First conversational response missing",
    );
    expect(document.body.textContent).toContain("Helping with");
    expect(document.body.textContent).toContain("First visit");
    expect(
      document.querySelector<HTMLAnchorElement>(
        'a[href="/classes#first-visit"]',
      ),
    ).not.toBeNull();

    await send("ต้องใส่ชุดอะไร");
    await waitFor(
      () => document.body.textContent?.includes("เคลื่อนไหวสะดวก") === true,
      "Thai follow-up response missing",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(firstBody).toMatchObject({
      locale: "en",
      page: "shared-record",
      message: "I'm new to aikido. Can I join this Saturday?",
      memory: { workflow: "none" },
    });
    expect(JSON.stringify(firstBody)).not.toContain("secret-route-token");
    expect(firstBody.messages).toHaveLength(1);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(secondBody.memory).toMatchObject({
      topic: "First visit",
      workflow: "first-visit",
      draft: { visitDay: "Saturday" },
    });
    expect(
      secondBody.messages.map((entry: { content: string }) => entry.content),
    ).toEqual(
      expect.arrayContaining([
        "I'm new to aikido. Can I join this Saturday?",
        "Yes. Beginners can join. What would you like to know?",
      ]),
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  });

  it("uses natural Thai UI and sends Thai as the active locale", async () => {
    localStorage.setItem("rsk-lang", "th");
    const fetchMock = vi.fn(async () =>
      Response.json(
        response("ผู้เริ่มต้นมาเรียนได้ครับ", {
          locale: "th",
          memory: { ...emptyPublicHelpMemory("th"), topic: "ผู้เริ่มต้น" },
        }),
      ),
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
    await openHelp();
    expect(document.body.textContent).toContain("ให้ฉันช่วยอะไรได้บ้าง?");
    await send("ผมไม่เคยฝึกไอคิโดมาก่อน สามารถมาเรียนได้ไหม");
    await waitFor(
      () => fetchMock.mock.calls.length === 1,
      "Thai request missing",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      locale: "th",
      message: "ผมไม่เคยฝึกไอคิโดมาก่อน สามารถมาเรียนได้ไหม",
    });
  });

  it("clears transcript, summary, workflow, form draft, inferred language, and follow-up on Start over", async () => {
    const examMemory = {
      ...emptyPublicHelpMemory("en"),
      language: "th" as const,
      topic: "Exam application",
      workflow: "exam-application" as const,
      form: "Belt-examination application",
      step: "Payment proof",
      subject: "Submitted application",
      unresolvedQuestion: "Do you need help finding payment proof?",
      draft: {
        ...emptyPublicHelpMemory("en").draft,
        examIntent: "check existing",
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          response("I can explain the examination process.", {
            mode: "guided",
            memory: examMemory,
          }),
        ),
      )
      .mockResolvedValueOnce(
        Response.json(response("Which process do you mean?")),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
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
    await send("I need help with my exam application.");
    await waitFor(
      () => document.body.textContent?.includes("examination process") === true,
      "Exam response missing",
    );
    const reset = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("Start over"))!;
    await act(async () => reset.click());
    expect(document.body.textContent).not.toContain(
      "I need help with my exam application.",
    );
    expect(document.body.textContent).not.toContain("Payment proof");
    expect(document.body.textContent).toContain("How can I help?");
    const stored = JSON.parse(
      sessionStorage.getItem(PUBLIC_HELP_CHAT_STORAGE_KEY)!,
    );
    expect(stored.memory).toEqual(emptyPublicHelpMemory("en"));

    await send("What am I still missing?");
    await waitFor(
      () => fetchMock.mock.calls.length === 2,
      "Post-reset request missing",
    );
    const resetBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(resetBody.memory).toEqual(emptyPublicHelpMemory("en"));
    expect(resetBody.messages).toEqual([
      {
        role: "assistant",
        content:
          "How can I help?\n\nAsk me about classes, visiting the dojo, forms, training, examinations, or how to use your own student record.",
      },
    ]);
  });

  it("uses Enter to send, Shift+Enter for a new line, and exposes a visible loading state", async () => {
    let resolveFetch: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
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
    await openHelp();
    const composer = document.getElementById(
      "public-help-message",
    ) as HTMLTextAreaElement;
    await setInputValue(composer, "What should I wear?");
    await act(async () => {
      composer.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      composer.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Auggie is thinking");
    await act(async () => {
      resolveFetch!(Response.json(response("Wear loose clothing.")));
      await Promise.resolve();
    });
    await waitFor(
      () => document.body.textContent?.includes("Wear loose clothing") === true,
      "Answer did not render",
    );
  });

  it("falls back to static guides on model failure and rejects malformed model prose", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ outcome: "unavailable" }, { status: 503 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          outcome: "answer",
          reply: "MALICIOUS MODEL PROSE",
          mode: "general",
          links: [],
          memory: emptyPublicHelpMemory("en"),
          extra: "not allowed",
        }),
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
    await openHelp();
    await send("training hours");
    await waitFor(
      () =>
        document.body.textContent?.includes("temporarily unavailable") === true,
      "Static fallback did not appear",
    );
    expect(
      document.querySelector<HTMLAnchorElement>('a[href="/student-records"]'),
    ).not.toBeNull();
    await send("Can I watch first?");
    await waitFor(
      () =>
        document.body.textContent?.includes("I couldn’t answer that") === true,
      "Malformed response fallback did not appear",
    );
    expect(document.body.textContent).not.toContain("MALICIOUS MODEL PROSE");
  });

  it("keeps Japanese and Chinese on the existing static help experience", async () => {
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
    const trigger =
      document.querySelector<HTMLButtonElement>(".help-launcher")!;
    await act(async () => trigger.click());
    await waitFor(
      () => Boolean(document.querySelector('input[type="search"]')),
      "Static Japanese help did not load",
    );
    expect(document.getElementById("public-help-message")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

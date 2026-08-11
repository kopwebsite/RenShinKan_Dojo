export type PublicHelpAssistantLocale = "en" | "th";

export type PublicHelpPageContext =
  | "home"
  | "classes"
  | "aikido"
  | "student-records"
  | "student-profile-form"
  | "training-hours-form"
  | "exam-application-form"
  | "shared-record"
  | "support"
  | "contact"
  | "newsletter"
  | "downloads"
  | "community"
  | "workshops"
  | "other";

export type PublicHelpWorkflow =
  | "none"
  | "first-visit"
  | "student-profile"
  | "training-hours"
  | "exam-application"
  | "payment-proof"
  | "contribution";

export type PublicHelpChatMemory = {
  language: PublicHelpAssistantLocale;
  topic: string;
  workflow: PublicHelpWorkflow;
  form: string;
  step: string;
  subject: string;
  unresolvedQuestion: string;
  draft: {
    trainingDate: string;
    trainingType: string;
    trainingHours: string;
    visitDay: string;
    examIntent: string;
  };
};

export type PublicHelpChatLink = { label: string; href: string };

export type PublicHelpAssistantResponse =
  | {
      outcome: "answer";
      reply: string;
      mode: "general" | "guided" | "personal-unavailable" | "privacy-refusal";
      links: PublicHelpChatLink[];
      memory: PublicHelpChatMemory;
    }
  | { outcome: "unavailable" };

export type PublicHelpUiMessage = {
  role: "user" | "assistant";
  content: string;
  links?: PublicHelpChatLink[];
};

export const PUBLIC_HELP_CHAT_STORAGE_KEY = "rsk-public-help-chat-v2";
export const PUBLIC_HELP_CHAT_MAX_VISIBLE_MESSAGES = 20;
export const PUBLIC_HELP_CHAT_MAX_MODEL_MESSAGES = 10;

export const publicHelpAssistantCopy = {
  en: {
    heading: "Ask Auggie",
    welcome:
      "How can I help?\n\nAsk me about classes, visiting the dojo, forms, training, examinations, or how to use your own student record.",
    hint: "Not sure what to ask? Type “help”.",
    placeholder: "Ask a question…",
    send: "Send",
    sending: "Auggie is thinking…",
    reset: "Start over",
    resetConfirm:
      "Start over and clear this chat, its topic, workflow, form draft, inferred language, and follow-up question? Permanent website or student records will not change.",
    privacySummary: "Privacy and chat memory",
    privacy:
      "Your message and recent chat are sent to the AI service so Auggie can understand your question. This temporary chat is kept only in this browser tab and is cleared by Start over or when the tab closes. Auggie cannot read student or administration records. Do not paste Student IDs, private links, payment details, or other sensitive information.",
    helpingWith: "Helping with",
    fallback:
      "AI help is temporarily unavailable. The public guides below still work.",
    rateLimited:
      "Auggie has reached the short-term request limit. Please use the public guides below and try again later.",
    error:
      "I couldn’t answer that just now. The public guides below still work.",
    guides: "Public guides",
    guidesHint: "Search or open a step-by-step guide at any time.",
    searchLabel: "Search public guides",
    you: "You",
    assistant: "Auggie",
    newMessage: "New assistant response",
  },
  th: {
    heading: "ถาม Auggie",
    welcome:
      "ให้ฉันช่วยอะไรได้บ้าง?\n\nถามเรื่องชั้นเรียน การเยี่ยมชมโดโจ แบบฟอร์ม การฝึก การสอบ หรือวิธีใช้ระเบียนนักเรียนของคุณได้",
    hint: "ไม่แน่ใจว่าจะถามอะไร? พิมพ์ “ช่วยเหลือ”",
    placeholder: "พิมพ์คำถาม…",
    send: "ส่ง",
    sending: "Auggie กำลังคิด…",
    reset: "เริ่มใหม่",
    resetConfirm:
      "เริ่มใหม่และล้างข้อความ หัวข้อ ขั้นตอน แบบร่าง ภาษา และคำถามที่ค้างอยู่หรือไม่? ข้อมูลถาวรบนเว็บไซต์และระเบียนนักเรียนจะไม่เปลี่ยนแปลง",
    privacySummary: "ความเป็นส่วนตัวและความจำของแชต",
    privacy:
      "ข้อความและบทสนทนาล่าสุดจะถูกส่งไปยังบริการ AI เพื่อให้ Auggie เข้าใจคำถาม แชตชั่วคราวนี้เก็บไว้เฉพาะในแท็บเบราว์เซอร์นี้ และจะถูกล้างเมื่อกดเริ่มใหม่หรือปิดแท็บ Auggie ไม่สามารถอ่านระเบียนนักเรียนหรือข้อมูลผู้ดูแลได้ โปรดอย่าใส่รหัสนักเรียน ลิงก์ส่วนตัว ข้อมูลการชำระเงิน หรือข้อมูลที่ละเอียดอ่อน",
    helpingWith: "กำลังช่วยเรื่อง",
    fallback:
      "บริการ AI ไม่พร้อมใช้งานชั่วคราว แต่คู่มือสาธารณะด้านล่างยังใช้งานได้",
    rateLimited:
      "Auggie ถึงขีดจำกัดคำขอชั่วคราวแล้ว โปรดใช้คู่มือสาธารณะด้านล่างและลองใหม่ภายหลัง",
    error: "ตอนนี้ฉันตอบไม่ได้ แต่คู่มือสาธารณะด้านล่างยังใช้งานได้",
    guides: "คู่มือสาธารณะ",
    guidesHint: "ค้นหาหรือเปิดคู่มือทีละขั้นตอนได้ทุกเมื่อ",
    searchLabel: "ค้นหาคู่มือสาธารณะ",
    you: "คุณ",
    assistant: "Auggie",
    newMessage: "คำตอบใหม่จากผู้ช่วย",
  },
} as const;

function plainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

const workflows = new Set<PublicHelpWorkflow>([
  "none",
  "first-visit",
  "student-profile",
  "training-hours",
  "exam-application",
  "payment-proof",
  "contribution",
]);

export function emptyPublicHelpMemory(
  locale: PublicHelpAssistantLocale,
): PublicHelpChatMemory {
  return {
    language: locale,
    topic: "",
    workflow: "none",
    form: "",
    step: "",
    subject: "",
    unresolvedQuestion: "",
    draft: {
      trainingDate: "",
      trainingType: "",
      trainingHours: "",
      visitDay: "",
      examIntent: "",
    },
  };
}

function parseMemory(
  value: unknown,
  locale: PublicHelpAssistantLocale,
): PublicHelpChatMemory | null {
  if (
    !plainObject(value) ||
    !exactKeys(value, [
      "draft",
      "form",
      "language",
      "step",
      "subject",
      "topic",
      "unresolvedQuestion",
      "workflow",
    ]) ||
    (value.language !== "en" && value.language !== "th") ||
    !workflows.has(value.workflow as PublicHelpWorkflow) ||
    !plainObject(value.draft) ||
    !exactKeys(value.draft, [
      "examIntent",
      "trainingDate",
      "trainingHours",
      "trainingType",
      "visitDay",
    ])
  ) {
    return null;
  }
  const limits: Array<[unknown, number]> = [
    [value.topic, 100],
    [value.form, 100],
    [value.step, 180],
    [value.subject, 120],
    [value.unresolvedQuestion, 240],
    [value.draft.trainingDate, 80],
    [value.draft.trainingType, 80],
    [value.draft.trainingHours, 30],
    [value.draft.visitDay, 80],
    [value.draft.examIntent, 80],
  ];
  if (
    limits.some(([item, max]) => typeof item !== "string" || item.length > max)
  )
    return null;
  return {
    language: value.language || locale,
    topic: value.topic as string,
    workflow: value.workflow as PublicHelpWorkflow,
    form: value.form as string,
    step: value.step as string,
    subject: value.subject as string,
    unresolvedQuestion: value.unresolvedQuestion as string,
    draft: {
      trainingDate: value.draft.trainingDate as string,
      trainingType: value.draft.trainingType as string,
      trainingHours: value.draft.trainingHours as string,
      visitDay: value.draft.visitDay as string,
      examIntent: value.draft.examIntent as string,
    },
  };
}

function safeLink(value: unknown): PublicHelpChatLink | null {
  if (
    !plainObject(value) ||
    !exactKeys(value, ["href", "label"]) ||
    typeof value.label !== "string" ||
    !value.label.trim() ||
    value.label.length > 100 ||
    typeof value.href !== "string" ||
    value.href.length > 500 ||
    /\/admin(?:\/|\b)|\/api(?:\/|\b)|\/records\/share\//i.test(value.href)
  ) {
    return null;
  }
  if (!value.href.startsWith("/") && !value.href.startsWith("https://"))
    return null;
  return { label: value.label.trim(), href: value.href };
}

export function parsePublicHelpAssistantResponse(
  value: unknown,
  locale: PublicHelpAssistantLocale,
): PublicHelpAssistantResponse | null {
  if (!plainObject(value) || typeof value.outcome !== "string") return null;
  if (value.outcome === "unavailable") {
    return exactKeys(value, ["outcome"]) ? { outcome: "unavailable" } : null;
  }
  if (
    value.outcome !== "answer" ||
    !exactKeys(value, ["links", "memory", "mode", "outcome", "reply"]) ||
    typeof value.reply !== "string" ||
    !value.reply.trim() ||
    value.reply.length > 1_600 ||
    !["general", "guided", "personal-unavailable", "privacy-refusal"].includes(
      String(value.mode),
    ) ||
    !Array.isArray(value.links) ||
    value.links.length > 3
  ) {
    return null;
  }
  const memory = parseMemory(value.memory, locale);
  const links = value.links.map(safeLink);
  if (!memory || links.some((link) => !link)) return null;
  return {
    outcome: "answer",
    reply: value.reply.trim(),
    mode: value.mode as Exclude<
      PublicHelpAssistantResponse,
      { outcome: "unavailable" }
    >["mode"],
    links: links as PublicHelpChatLink[],
    memory,
  };
}

export function publicHelpPageContext(
  pathname: string,
  search: string,
  visibleForm: "profile" | "training-hours" | "exam" | null = null,
): PublicHelpPageContext {
  if (/^\/records\/share\//.test(pathname)) return "shared-record";
  if (/^\/student-records/.test(pathname)) {
    if (visibleForm === "training-hours") return "training-hours-form";
    if (visibleForm === "exam") return "exam-application-form";
    if (visibleForm === "profile") return "student-profile-form";
    const task = new URLSearchParams(search).get("task");
    if (task === "profile") return "student-profile-form";
    if (task === "exam") return "exam-application-form";
    return "student-records";
  }
  if (/^\/classes/.test(pathname)) return "classes";
  if (/^\/aikido/.test(pathname)) return "aikido";
  if (/^\/support/.test(pathname)) return "support";
  if (/^\/contact/.test(pathname)) return "contact";
  if (/^\/newsletter/.test(pathname)) return "newsletter";
  if (/^\/downloads/.test(pathname)) return "downloads";
  if (/^\/community/.test(pathname)) return "community";
  if (/^\/workshops/.test(pathname)) return "workshops";
  if (pathname === "/") return "home";
  return "other";
}

export function parseStoredPublicHelpChat(
  value: string | null,
  locale: PublicHelpAssistantLocale,
): { messages: PublicHelpUiMessage[]; memory: PublicHelpChatMemory } | null {
  if (!value || value.length > 32_000) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !plainObject(parsed) ||
      !exactKeys(parsed, ["memory", "messages"]) ||
      !Array.isArray(parsed.messages)
    )
      return null;
    const memory = parseMemory(parsed.memory, locale);
    if (
      !memory ||
      parsed.messages.length > PUBLIC_HELP_CHAT_MAX_VISIBLE_MESSAGES
    )
      return null;
    const messages: PublicHelpUiMessage[] = [];
    for (const entry of parsed.messages) {
      if (
        !plainObject(entry) ||
        !["user", "assistant"].includes(String(entry.role)) ||
        typeof entry.content !== "string" ||
        !entry.content.trim() ||
        entry.content.length > 1_600 ||
        (Object.hasOwn(entry, "links") && !Array.isArray(entry.links))
      ) {
        return null;
      }
      const links = Array.isArray(entry.links) ? entry.links.map(safeLink) : [];
      if (links.some((link) => !link)) return null;
      messages.push({
        role: entry.role as PublicHelpUiMessage["role"],
        content: entry.content,
        ...(links.length ? { links: links as PublicHelpChatLink[] } : {}),
      });
    }
    return { messages, memory };
  } catch {
    return null;
  }
}

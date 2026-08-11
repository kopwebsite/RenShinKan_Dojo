import {
  Bot,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { useAdminTranslation } from "../../i18n";
import { AccessibleDialog } from "../AccessibleDialog";
import { useAdminSession } from "./useAdminSession";
import "./admin-auggie-panel.css";

type Locale = "en" | "th";

type StudentPreview = {
  studentId?: string;
  name?: string;
  dojo?: string;
  rank?: string;
  status?: string;
  before?: string;
  after?: string;
  pendingRequests?: number;
  pendingHours?: number;
};

type Operation = {
  id: string;
  executable: boolean;
  status: string;
  expiresAt: string;
  confirmationPhrase?: string;
  secondaryConfirmationPhrase?: string;
  requiresSecondaryConfirmation?: boolean;
  undoable?: boolean;
  highImpact?: boolean;
  path: string;
  warning: string;
  preview?: {
    action?: string;
    count?: number;
    dojos?: string[];
    records?: StudentPreview[];
    manualOnly?: boolean;
    month?: string;
    cycle?: string;
    amount?: number | null;
    hours?: number;
    entryDate?: string;
    location?: string;
    coveredStudentCount?: number;
    photoAttached?: boolean;
  };
};

type SummaryRow = { label: string; value: string };

type GuidedFlow = {
  id: string;
  title: string;
  question: string;
  hint?: string;
  optional?: boolean;
  optionalNote?: string;
  choices?: string[];
  step: number;
  total: number;
  progressLabel: string;
  guide: string;
  answers?: SummaryRow[];
  canGoBack?: boolean;
  startedAt: string;
};

type AssistantResponse = {
  kind:
    | "navigate"
    | "dashboard"
    | "students"
    | "proposal"
    | "result"
    | "flow"
    | "conversation";
  heading: string;
  message: string;
  path?: string;
  manualOnly?: boolean;
  counts?: Record<string, number>;
  students?: StudentPreview[];
  operation?: Operation;
  result?: OperationResult;
  flow?: GuidedFlow;
  summary?: SummaryRow[];
};

type OperationResult = {
  ok?: boolean;
  operationId?: string;
  action?: string;
  count?: number;
  records?: StudentPreview[];
  completedAt?: string;
  undoUntil?: string;
};

type ConversationItem =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; response: AssistantResponse };

type UsageSummary = {
  date: string;
  label: string;
  budgetTokens: number;
  totalTokens: number;
  remainingTokens: number;
  calls: number;
  unreportedCalls: number;
  providerQuota: false;
};

const copy = {
  en: {
    label: "Open Admin Auggie",
    title: "Admin Auggie",
    description: "An administration assistant limited to your current access",
    access: "Limited to your current access",
    logLabel: "Admin Auggie conversation",
    requestsAndHours: (requests: number, hours: number) =>
      `${requests} request(s) · ${hours} hours`,
    intro:
      "Ask Auggie a dojo administration question in English or Thai. Type help to see what it can do.",
    privacyLabel: "Privacy and AI use",
    privacy:
      "Your typed messages, recent brief replies, and minimal references for selected records may be sent to Cloudflare Workers AI to understand follow-ups. Those references can include a student name, Student ID, dojo, and status already shown in this chat. Full database rows, files, proof images, questionnaire answers, and private notes are not added to the model request. Do not type secrets or extra private details into the chat. A weather question sends only the place name to a weather service. Reads and writes run on the server under your current access. Nothing writes automatically: you must type the exact confirmation phrase yourself; money, permanent, or high-impact changes need a second phrase. The bounded transcript is tied to this sign-in and dojo, expires after two hours, and clears on reset or sign-out.",
    usage: (used: number, budget: number, remaining: number) =>
      `Auggie daily budget: ${used.toLocaleString()} / ${budget.toLocaleString()} tokens · ${remaining.toLocaleString()} remaining`,
    usageMissing: "Provider usage unavailable for some calls",
    examplesTitle: "Try asking",
    examples: [
      "Show me the dashboard summary",
      "Find Student ID RSK-1001",
      "Add 3 training hours to RSK-1001 for yesterday",
    ],
    placeholder: "Example: Find Student ID RSK-1001",
    send: "Send",
    sending: "Just a moment…",
    startOver: "Start over",
    startOverBusy: "Clearing…",
    startOverConfirm:
      "Starting over clears this chat, selected records, unfinished tasks, and pending proposals. Permanent dojo data and today's usage are not erased. Start over?",
    startedAgo: (age: string) => `Started ${age}`,
    justNow: "just now",
    minutesAgo: (count: number) =>
      `${count} minute${count === 1 ? "" : "s"} ago`,
    hoursAgo: (count: number) => `${count} hour${count === 1 ? "" : "s"} ago`,
    optionalLabel: "Optional",
    answersSoFar: "Your answers so far",
    close: "Close Admin Auggie",
    open: "Open page",
    manual: "Manual review required",
    confirmation:
      "To approve this proposal, type this exact phrase in the chat box:",
    secondConfirmation: "On a new line, type the second exact phrase:",
    confirm: "Confirm separate write",
    confirming: "Confirming transaction…",
    undo: "Prepare safe undo",
    undoing: "Checking undo…",
    expired: "This proposal has expired. Ask Auggie to prepare a new one.",
    resultTitle: "Operation completed",
    resultMessage: "The change was saved safely.",
    empty: "No matching records were returned in your current scope.",
    error: "The request failed safely. No action was taken.",
    attachLabel: "Add photo",
    attaching: "Uploading photo…",
    attached: "Photo attached",
    attachRemove: "Remove the attached photo",
    attachHint:
      "WebP image, up to 5 MB. The photo itself is never sent to AI — only its stored id is used, and only in a proposal you confirm.",
    attachTypeError: "Please choose a WebP image.",
    attachSizeError: "That image is larger than 5 MB.",
    attachError: "The photo could not be uploaded. Nothing was changed.",
    countLabels: {
      pendingProfiles: "Profile requests",
      pendingExams: "Exam payments",
      pendingAatPayments: "AAT payments",
      pendingTrainingHours: "Training hours",
      pendingMonthlyContributions: "Monthly contributions",
      pendingPaymentProofs: "Payment proofs",
      activeStudents: "Active students",
      total: "On the roster",
      paid: "Paid",
      awaitingPayment: "Awaiting payment",
      noSubmission: "Nothing submitted",
    } as Record<string, string>,
  },
  th: {
    label: "เปิด Admin Auggie",
    title: "Admin Auggie",
    access: "จำกัดตามสิทธิ์ปัจจุบันของคุณ",
    logLabel: "บทสนทนา Admin Auggie",
    requestsAndHours: (requests: number, hours: number) =>
      `${requests} คำขอ · ${hours} ชั่วโมง`,
    description: "ผู้ช่วยงานผู้ดูแลตามขอบเขตสิทธิ์",
    intro:
      "ถาม Auggie เรื่องงานผู้ดูแลโดโจได้ทั้งภาษาไทยและอังกฤษ พิมพ์ ช่วยเหลือ เพื่อดูสิ่งที่ทำได้",
    privacyLabel: "ความเป็นส่วนตัวและการใช้ AI",
    privacy:
      "ข้อความที่พิมพ์ คำตอบสั้น ๆ ล่าสุด และข้อมูลอ้างอิงขั้นต่ำของรายการที่เลือก อาจถูกส่งไปยัง Cloudflare Workers AI เพื่อเข้าใจคำถามต่อเนื่อง ข้อมูลอ้างอิงอาจมีชื่อนักเรียน รหัสนักเรียน โดโจ และสถานะที่แสดงในแชตแล้ว ระบบจะไม่เพิ่มแถวฐานข้อมูลเต็ม ไฟล์ รูปหลักฐาน คำตอบแบบสอบถาม หรือบันทึกส่วนตัวลงในคำขอของโมเดล โปรดอย่าพิมพ์รหัสลับหรือข้อมูลส่วนตัวที่ไม่จำเป็นในแชต คำถามเรื่องสภาพอากาศจะส่งเฉพาะชื่อสถานที่ไปยังบริการพยากรณ์อากาศ การอ่านและเขียนทำบนเซิร์ฟเวอร์ตามสิทธิ์ปัจจุบัน ประวัติแบบจำกัดผูกกับการเข้าสู่ระบบและโดโจนี้ หมดอายุในสองชั่วโมง และล้างเมื่อเริ่มใหม่หรือออกจากระบบ",
    usage: (used: number, budget: number, remaining: number) =>
      `งบรายวันของ Auggie: ${used.toLocaleString()} / ${budget.toLocaleString()} โทเค็น · เหลือ ${remaining.toLocaleString()}`,
    usageMissing: "ไม่มีข้อมูลการใช้จากผู้ให้บริการสำหรับบางคำขอ",
    examplesTitle: "ลองถามดู",
    examples: [
      "ขอสรุปแดชบอร์ด",
      "ค้นหารหัสนักเรียน RSK-1001",
      "เพิ่มชั่วโมงฝึก 3 ชั่วโมงให้ RSK-1001 สำหรับเมื่อวาน",
    ],
    placeholder: "ตัวอย่าง: ค้นหารหัสนักเรียน RSK-1001",
    send: "ส่ง",
    sending: "สักครู่…",
    startOver: "เริ่มใหม่",
    startOverBusy: "กำลังล้างข้อมูล…",
    startOverConfirm:
      "การเริ่มใหม่จะล้างบทสนทนา รายการที่เลือก งานที่ยังไม่เสร็จ และข้อเสนอที่รอยืนยัน แต่จะไม่ลบข้อมูลถาวรของโดโจหรือยอดใช้งานวันนี้ ต้องการเริ่มใหม่หรือไม่",
    startedAgo: (age: string) => `เริ่มเมื่อ ${age}`,
    justNow: "เมื่อสักครู่",
    minutesAgo: (count: number) => `${count} นาทีที่แล้ว`,
    hoursAgo: (count: number) => `${count} ชั่วโมงที่แล้ว`,
    optionalLabel: "ไม่บังคับ",
    answersSoFar: "คำตอบของคุณจนถึงตอนนี้",
    close: "ปิด Admin Auggie",
    open: "เปิดหน้า",
    manual: "ต้องตรวจสอบด้วยตนเอง",
    confirmation:
      "หากอนุมัติข้อเสนอนี้ ให้พิมพ์ข้อความต่อไปนี้ในช่องแชตให้ตรงทุกตัวอักษร:",
    secondConfirmation: "ขึ้นบรรทัดใหม่แล้วพิมพ์ข้อความยืนยันที่สองให้ตรง:",
    confirm: "ยืนยันการเขียนข้อมูลแยกต่างหาก",
    confirming: "กำลังยืนยันธุรกรรม…",
    undo: "เตรียมการย้อนกลับอย่างปลอดภัย",
    undoing: "กำลังตรวจสอบการย้อนกลับ…",
    expired: "ข้อเสนอนี้หมดอายุแล้ว โปรดขอให้ Auggie เตรียมใหม่",
    resultTitle: "ดำเนินการเสร็จสิ้น",
    resultMessage: "บันทึกการเปลี่ยนแปลงอย่างปลอดภัยแล้ว",
    empty: "ไม่พบระเบียนที่ตรงกันในขอบเขตปัจจุบันของคุณ",
    error: "คำขอล้มเหลวอย่างปลอดภัย ไม่มีการดำเนินการใด ๆ",
    attachLabel: "เพิ่มรูป",
    attaching: "กำลังอัปโหลดรูป…",
    attached: "แนบรูปแล้ว",
    attachRemove: "นำรูปที่แนบออก",
    attachHint:
      "รูปแบบ WebP ไม่เกิน 5 MB ตัวรูปจะไม่ถูกส่งให้ AI ใช้เพียงรหัสรูปที่จัดเก็บไว้ และใช้เฉพาะในข้อเสนอที่คุณยืนยันเท่านั้น",
    attachTypeError: "โปรดเลือกรูปแบบ WebP",
    attachSizeError: "รูปมีขนาดเกิน 5 MB",
    attachError: "ไม่สามารถอัปโหลดรูปได้ ไม่มีการเปลี่ยนแปลงใด ๆ",
    countLabels: {
      pendingProfiles: "คำขอโปรไฟล์",
      pendingExams: "การชำระค่าสอบ",
      pendingAatPayments: "การชำระ AAT",
      pendingTrainingHours: "ชั่วโมงฝึก",
      pendingMonthlyContributions: "เงินสมทบรายเดือน",
      pendingPaymentProofs: "หลักฐานการชำระเงิน",
      activeStudents: "นักเรียนที่ใช้งาน",
      total: "รายชื่อทั้งหมด",
      paid: "ชำระแล้ว",
      awaitingPayment: "รอชำระ",
      noSubmission: "ยังไม่ส่ง",
    } as Record<string, string>,
  },
};

async function requestAuggie<T>(
  url: string,
  body: Record<string, unknown>,
  fallbackError: string,
) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new CustomEvent("admin-session-invalid"));
    // Always prefer the server's own plain-language, translated reason. The
    // fallback is only ever reached if a reply arrived with no readable body
    // at all, and it is translated too, so the panel never shows an
    // untranslated internal string.
    throw new Error(payload.error || fallbackError);
  }
  return payload;
}

// How long ago the saved conversation was started, so a conversation picked up
// after a break is never mistaken for a fresh one.
function conversationAge(startedAt: string, locale: Locale) {
  const text = copy[locale];
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return "";
  const minutes = Math.floor((Date.now() - started) / 60_000);
  if (minutes < 1) return text.startedAgo(text.justNow);
  if (minutes < 60) return text.startedAgo(text.minutesAgo(minutes));
  return text.startedAgo(text.hoursAgo(Math.floor(minutes / 60)));
}

function workingStatus(message: string, locale: Locale) {
  if (/contribution|paid|payment|เงินสมทบ|ชำระ/i.test(message))
    return locale === "th"
      ? "กำลังตรวจข้อมูลการชำระเงิน…"
      : "Checking contribution and payment records…";
  if (
    /add|change|update|archive|publish|เพิ่ม|เปลี่ยน|แก้|เผยแพร่/i.test(message)
  )
    return locale === "th"
      ? "กำลังตรวจข้อมูลปัจจุบันและเตรียมข้อเสนอ…"
      : "Checking current records and preparing the proposal…";
  if (/student|exam|training|นักเรียน|สอบ|ชั่วโมง|ฝึก/i.test(message))
    return locale === "th"
      ? "กำลังตรวจข้อมูลนักเรียน…"
      : "Checking student records…";
  return copy[locale].sending;
}

function GuidedFlowCard({
  flow,
  locale,
}: {
  flow: GuidedFlow;
  locale: Locale;
}) {
  const text = copy[locale];
  return (
    <div className="admin-auggie__flow">
      <p className="admin-auggie__flow-progress">
        <span>{flow.progressLabel}</span>
        <span>{conversationAge(flow.startedAt, locale)}</span>
      </p>
      {flow.answers && flow.answers.length > 0 && (
        <dl className="admin-auggie__flow-answers">
          <div className="admin-auggie__flow-answers-title">
            <dt>{text.answersSoFar}</dt>
            <dd />
          </div>
          {flow.answers.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {flow.question && (
        <p className="admin-auggie__flow-question">
          {flow.question}
          {flow.optional && (
            <span className="admin-auggie__flow-optional">
              {text.optionalLabel}
            </span>
          )}
        </p>
      )}
      {flow.hint && <p className="admin-auggie__flow-hint">{flow.hint}</p>}
      {flow.optional && flow.optionalNote && (
        <p className="admin-auggie__flow-hint">{flow.optionalNote}</p>
      )}
      {flow.choices && flow.choices.length > 0 && (
        <ul className="admin-auggie__flow-choices">
          {flow.choices.map((choice) => (
            <li key={choice}>{choice}</li>
          ))}
        </ul>
      )}
      <p className="admin-auggie__flow-guide">{flow.guide}</p>
    </div>
  );
}

function safeRecords(value: unknown): StudentPreview[] {
  return Array.isArray(value)
    ? value.filter((record): record is StudentPreview =>
        Boolean(record && typeof record === "object"),
      )
    : [];
}

function ResponseCard({
  response,
  locale,
  onNavigate,
}: {
  response: AssistantResponse;
  locale: Locale;
  onNavigate(path: string): void;
}) {
  const text = copy[locale];
  const operation = response.operation;
  const result = response.result;
  const records =
    response.students ??
    (operation ? safeRecords(operation.preview?.records) : undefined) ??
    result?.records ??
    [];
  const expired = operation
    ? Date.parse(operation.expiresAt) <= Date.now()
    : false;

  return (
    <article className="admin-auggie__response">
      <div className="admin-auggie__response-heading">
        <Bot size={18} aria-hidden="true" />
        <h3>{response.heading}</h3>
      </div>
      <p className="admin-auggie__message">{response.message}</p>

      {response.flow && <GuidedFlowCard flow={response.flow} locale={locale} />}

      {response.summary && response.summary.length > 0 && (
        <dl className="admin-auggie__flow-answers">
          {response.summary.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {response.manualOnly && (
        <p className="admin-auggie__manual">
          <ShieldCheck size={16} aria-hidden="true" /> {text.manual}
        </p>
      )}

      {response.counts && (
        <dl className="admin-auggie__counts">
          {Object.entries(response.counts).map(([key, value]) => (
            <div key={key}>
              <dt>{text.countLabels[key] || key.replace(/([A-Z])/g, " $1")}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(response.kind === "students" || operation || result) && (
        <div className="admin-auggie__records">
          {records.length ? (
            records.map((record, index) => (
              <div
                className="admin-auggie__record"
                key={`${record.studentId || "record"}-${index}`}
              >
                <strong>
                  {record.studentId || "—"} · {record.name || "—"}
                </strong>
                <span>{record.dojo || ""}</span>
                <span>
                  {record.before && record.after
                    ? `${record.before} → ${record.after}`
                    : [record.rank, record.status].filter(Boolean).join(" · ")}
                </span>
                {record.pendingRequests !== undefined && (
                  <span>
                    {text.requestsAndHours(
                      record.pendingRequests,
                      record.pendingHours || 0,
                    )}
                  </span>
                )}
              </div>
            ))
          ) : (
            <p>{text.empty}</p>
          )}
        </div>
      )}

      {result?.undoUntil && Date.parse(result.undoUntil) > Date.now() && (
        <p className="admin-auggie__manual">
          {locale === "th"
            ? "หากต้องการเตรียมการย้อนกลับอย่างปลอดภัย ให้พิมพ์ ย้อนกลับ"
            : "Type undo to prepare a separate safe reversal proposal."}
        </p>
      )}

      {operation && (
        <div className="admin-auggie__operation">
          <dl className="admin-auggie__operation-summary">
            <div>
              <dt>
                {locale === "th" ? "รายการที่ได้รับผล" : "Affected records"}
              </dt>
              <dd>{operation.preview?.count ?? records.length}</dd>
            </div>
            <div>
              <dt>{locale === "th" ? "โดโจ" : "Dojo"}</dt>
              <dd>
                {operation.preview?.dojos?.join(", ") ||
                  records
                    .map((record) => record.dojo)
                    .filter(Boolean)
                    .filter((dojo, index, all) => all.indexOf(dojo) === index)
                    .join(", ") ||
                  "—"}
              </dd>
            </div>
            {operation.preview?.entryDate && (
              <div>
                <dt>{locale === "th" ? "วันที่" : "Date"}</dt>
                <dd>{operation.preview.entryDate}</dd>
              </div>
            )}
            {operation.preview?.hours !== undefined && (
              <div>
                <dt>{locale === "th" ? "ชั่วโมงที่เพิ่ม" : "Hours to add"}</dt>
                <dd>{operation.preview.hours}</dd>
              </div>
            )}
            {operation.preview?.location && (
              <div>
                <dt>{locale === "th" ? "สถานที่" : "Location"}</dt>
                <dd>{operation.preview.location}</dd>
              </div>
            )}
          </dl>
          <p
            className={`admin-auggie__warning${operation.highImpact ? " admin-auggie__warning--high-impact" : ""}`}
          >
            {expired ? text.expired : operation.warning}
          </p>
          {operation.executable && operation.confirmationPhrase && !expired ? (
            <div className="admin-auggie__typed-confirmation">
              <p>{text.confirmation}</p>
              <code>{operation.confirmationPhrase}</code>
              {operation.secondaryConfirmationPhrase && (
                <div>
                  <p>{text.secondConfirmation}</p>
                  <code>{operation.secondaryConfirmationPhrase}</code>
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => onNavigate(operation.path)}>
              <ExternalLink size={17} aria-hidden="true" /> {text.open}
            </button>
          )}
        </div>
      )}

      {response.path && (
        <button
          type="button"
          className="admin-auggie__open"
          onClick={() => onNavigate(response.path!)}
        >
          <ExternalLink size={17} aria-hidden="true" /> {text.open}
        </button>
      )}
    </article>
  );
}

export function AdminAuggiePanel({
  open,
  onClose,
  triggerRef,
}: {
  open: boolean;
  onClose(): void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { language } = useAdminTranslation();
  const locale: Locale = language === "th" ? "th" : "en";
  const text = copy[locale];
  const location = useLocation();
  const navigate = useNavigate();
  const { admin } = useAdminSession();
  // Only the RenShinKan administrator may upload website or gallery media, so
  // the attach control is offered to nobody else. The server enforces the same
  // rule; this only keeps a button that could never work off the screen.
  const canAttach = admin?.role === "central";
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(text.sending);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [attachment, setAttachment] = useState<{
    id: string;
    url: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) logEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [busy, items, open]);

  // A conversation left part way through is kept on the server, so reopening
  // the panel or reloading the page carries on from the same question with the
  // answers already given.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const query = new URLSearchParams({
      locale,
      currentPath: location.pathname,
    });
    fetch(`/api/admin/auggie/session?${query.toString()}`, {
      credentials: "include",
      cache: "no-store",
      headers: { "X-Request-ID": crypto.randomUUID() },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          payload: {
            response?: AssistantResponse | null;
            messages?: Array<
              | { role: "user"; text: string }
              | { role: "assistant"; response: AssistantResponse }
            >;
            usage?: UsageSummary;
          } | null,
        ) => {
          if (cancelled || !payload) return;
          const restored: ConversationItem[] = (payload.messages || []).map(
            (entry) =>
              entry.role === "user"
                ? { id: crypto.randomUUID(), role: "user", text: entry.text }
                : {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    response: entry.response,
                  },
          );
          if (payload.response) {
            const last = restored.at(-1);
            if (last?.role === "assistant" && last.response.kind === "flow")
              restored[restored.length - 1] = {
                id: crypto.randomUUID(),
                role: "assistant",
                response: payload.response,
              };
            else if (!restored.length)
              restored.push({
                id: crypto.randomUUID(),
                role: "assistant",
                response: payload.response,
              });
          }
          setItems(restored);
          setUsage(payload.usage || null);
        },
      )
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [locale, location.pathname, open]);

  function appendResponse(response: AssistantResponse) {
    setItems((current) => [
      ...current.slice(-9),
      { id: crypto.randomUUID(), role: "assistant", response },
    ]);
  }

  // Uploads the chosen photo through one context-neutral Admin Auggie endpoint.
  // The panel keeps only the id and preview URL it returns; image bytes are
  // never sent to AI. The following conversation decides whether a confirmed
  // newsletter or gallery proposal uses the stored photo.
  async function uploadPhoto(file: File) {
    if (uploading || busy) return;
    setError("");
    if (!file.type.startsWith("image/") || file.type !== "image/webp") {
      setError(text.attachTypeError);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(text.attachSizeError);
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("files", file, file.name);
      const response = await fetch("/api/admin/auggie/photo", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "X-Request-ID": crypto.randomUUID() },
        body,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        asset?: { id?: string; url?: string };
      };
      if (!response.ok || !payload.asset?.id || !payload.asset.url) {
        if (response.status === 401)
          window.dispatchEvent(new CustomEvent("admin-session-invalid"));
        throw new Error(payload.error || text.attachError);
      }
      setAttachment({ id: payload.asset.id, url: payload.asset.url });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.attachError);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const latest = message.trim();
    if (!latest || busy) return;
    const attachedId = attachment?.id;
    setMessage("");
    setError("");
    setBusy(true);
    setWorking(workingStatus(latest, locale));
    setItems((current) => [
      ...current.slice(-8),
      { id: crypto.randomUUID(), role: "user", text: latest },
    ]);
    try {
      const payload = await requestAuggie<{
        response: AssistantResponse;
        usage?: UsageSummary;
      }>(
        "/api/admin/auggie/chat",
        {
          message: latest,
          locale,
          currentPath: location.pathname,
          ...(attachedId ? { attachment: attachedId } : {}),
        },
        text.error,
      );
      appendResponse(payload.response);
      if (payload.usage) setUsage(payload.usage);
      // Keep the photo available while Auggie asks follow-up questions. It is
      // removed only after a proposal proves that it actually bound the stored
      // asset; otherwise the administrator can remove it explicitly.
      if (
        attachedId &&
        payload.response.operation?.preview?.photoAttached === true
      )
        setAttachment(null);
    } catch (reason) {
      appendResponse({
        kind: "conversation",
        heading:
          locale === "th" ? "ยังดำเนินการไม่ได้" : "I couldn't complete that",
        message: reason instanceof Error ? reason.message : text.error,
      });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  // Clears the saved conversation on the server and empties the panel. A
  // conversation already part way through is confirmed first.
  async function startOver() {
    if (resetting) return;
    if (items.length > 0 && !confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setConfirmingReset(false);
    setResetting(true);
    setError("");
    try {
      const payload = await requestAuggie<{ usage?: UsageSummary }>(
        "/api/admin/auggie/reset",
        {
          locale,
          currentPath: location.pathname,
        },
        text.error,
      );
      setItems([]);
      if (payload.usage) setUsage(payload.usage);
      setMessage("");
      setAttachment(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.error);
    } finally {
      setResetting(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function openPath(path: string) {
    onClose();
    navigate(path);
  }

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      initialFocusRef={inputRef}
      titleId="admin-auggie-title"
      descriptionId="admin-auggie-description"
      backdropClassName="admin-auggie__backdrop"
      panelClassName="admin-auggie__panel"
      panelAs="aside"
    >
      <header className="admin-auggie__header">
        <div>
          <span className="admin-auggie__eyebrow">
            <ShieldCheck size={15} aria-hidden="true" />
            {text.access}
          </span>
          <h2 id="admin-auggie-title">{text.title}</h2>
          <p id="admin-auggie-description">{text.description}</p>
          {usage && (
            <small
              className="admin-auggie__usage"
              title="Application budget, not the Cloudflare provider quota"
            >
              {text.usage(
                usage.totalTokens,
                usage.budgetTokens,
                usage.remainingTokens,
              )}
              {usage.unreportedCalls > 0 ? ` · ${text.usageMissing}` : ""}
            </small>
          )}
        </div>
        <div className="admin-auggie__header-actions">
          <button
            type="button"
            className="admin-auggie__reset"
            onClick={startOver}
            disabled={resetting || busy}
          >
            {resetting ? (
              <LoaderCircle
                className="admin-auggie__spin"
                size={16}
                aria-hidden="true"
              />
            ) : (
              <RefreshCw size={16} aria-hidden="true" />
            )}
            <span>{resetting ? text.startOverBusy : text.startOver}</span>
          </button>
          <button
            type="button"
            className="admin-auggie__close"
            onClick={onClose}
            aria-label={text.close}
          >
            <X size={21} aria-hidden="true" />
          </button>
        </div>
      </header>

      {confirmingReset && (
        <div className="admin-auggie__reset-confirm" role="alert">
          <p>{text.startOverConfirm}</p>
          <div>
            <button type="button" onClick={startOver}>
              {text.startOver}
            </button>
            <button type="button" onClick={() => setConfirmingReset(false)}>
              {locale === "th" ? "ทำต่อ" : "Keep going"}
            </button>
          </div>
        </div>
      )}

      <div
        className="admin-auggie__log"
        role="log"
        aria-label={text.logLabel}
        aria-live="polite"
        aria-relevant="additions text"
      >
        <div className="admin-auggie__intro">
          <p>{text.intro}</p>
          <details>
            <summary>{text.privacyLabel}</summary>
            <small>{text.privacy}</small>
          </details>
          {items.length === 0 && (
            <div className="admin-auggie__examples">
              <p className="admin-auggie__examples-title">
                {text.examplesTitle}
              </p>
              <ul>
                {text.examples.map((example) => (
                  <li key={example}>
                    <button
                      type="button"
                      onClick={() => {
                        setMessage(example);
                        requestAnimationFrame(() => inputRef.current?.focus());
                      }}
                    >
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {items.map((item) =>
          item.role === "user" ? (
            <p className="admin-auggie__user-message" key={item.id}>
              {item.text}
            </p>
          ) : (
            <ResponseCard
              key={item.id}
              response={item.response}
              locale={locale}
              onNavigate={openPath}
            />
          ),
        )}
        {busy && (
          <p className="admin-auggie__status">
            <LoaderCircle
              className="admin-auggie__spin"
              size={17}
              aria-hidden="true"
            />{" "}
            {working}
          </p>
        )}
        {error && (
          <p className="admin-auggie__error" role="alert">
            {error}
          </p>
        )}
        <div ref={logEndRef} />
      </div>

      {canAttach && (
        <div className="admin-auggie__attach">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadPhoto(file);
            }}
          />
          {attachment ? (
            <div className="admin-auggie__attach-chip">
              <img src={attachment.url} alt="" />
              <span>{text.attached}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                aria-label={text.attachRemove}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="admin-auggie__attach-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || busy}
              >
                {uploading ? (
                  <LoaderCircle
                    className="admin-auggie__spin"
                    size={16}
                    aria-hidden="true"
                  />
                ) : (
                  <ImagePlus size={16} aria-hidden="true" />
                )}
                <span>{uploading ? text.attaching : text.attachLabel}</span>
              </button>
              <p className="admin-auggie__attach-hint">{text.attachHint}</p>
            </>
          )}
        </div>
      )}

      <form className="admin-auggie__composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="admin-auggie-message">
          {text.placeholder}
        </label>
        <textarea
          ref={inputRef}
          id="admin-auggie-message"
          rows={2}
          maxLength={1600}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={text.placeholder}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !message.trim()}
          aria-label={text.send}
        >
          {busy ? (
            <LoaderCircle
              className="admin-auggie__spin"
              size={19}
              aria-hidden="true"
            />
          ) : (
            <Send size={19} aria-hidden="true" />
          )}
          <span>{text.send}</span>
        </button>
      </form>
    </AccessibleDialog>
  );
}

export default AdminAuggiePanel;

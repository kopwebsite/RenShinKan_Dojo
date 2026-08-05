import {
  Bot,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
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
    coveredStudentCount?: number;
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
  operationId: string;
  action?: string;
  count?: number;
  records?: StudentPreview[];
  completedAt?: string;
  undoUntil?: string;
};

type ConversationItem =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; response: AssistantResponse };

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
      "Ask for a summary, find a student, or open an administration page. Auggie can also walk you through making a new student profile, writing a newsletter, adding training hours or recording an examination result, one question at a time. Nothing is created or changed until you type the exact confirmation phrase yourself, and some changes need two. Auggie can never open private files or upload media.",
    privacy:
      "Only your first request is sent to AI, and only so it can work out what you want. Once a step-by-step conversation starts, nothing at all is sent to AI: every question and reply is written into this website. Your answers and database results are never sent to AI and are never kept as a chat transcript. Answers you have given are held on our server against your own sign-in and dojo, are cleared when you sign out or start over, and expire on their own after two hours.",
    placeholder: "Example: Find Student ID RSK-1001",
    send: "Send",
    sending: "Just a moment…",
    startOver: "Start over",
    startOverBusy: "Clearing…",
    startOverConfirm:
      "You are part way through something. Starting over will clear the answers you have given so far. Nothing you have already saved is affected. Start over?",
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
    confirmation: "Exact confirmation phrase",
    secondConfirmation:
      "Second exact confirmation (money, payslip, permanent deletion, public website, or real email send)",
    confirm: "Confirm separate write",
    confirming: "Confirming transaction…",
    undo: "Prepare safe undo",
    undoing: "Checking undo…",
    expired: "This proposal has expired. Ask Auggie to prepare a new one.",
    resultTitle: "Operation completed",
    resultMessage: "The change was saved safely.",
    empty: "No matching records were returned in your current scope.",
    error: "The request failed safely. No action was taken.",
    countLabels: {
      pendingProfiles: "Profile requests",
      pendingExams: "Exam payments",
      pendingAatPayments: "AAT payments",
      pendingTrainingHours: "Training hours",
      pendingMonthlyContributions: "Monthly contributions",
      pendingPaymentProofs: "Payment proofs",
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
      "ขอสรุป ค้นหานักเรียน หรือเปิดหน้าผู้ดูแลได้ Auggie ยังช่วยแนะนำทีละขั้นตอนในการสร้างประวัตินักเรียนใหม่ เขียนจดหมายข่าว เพิ่มชั่วโมงฝึก หรือบันทึกผลการสอบ โดยถามทีละคำถาม จะไม่มีการสร้างหรือเปลี่ยนแปลงใดจนกว่าคุณจะพิมพ์ข้อความยืนยันให้ตรงด้วยตนเอง และบางรายการต้องยืนยันสองครั้ง Auggie ไม่สามารถเปิดไฟล์ส่วนตัวหรืออัปโหลดสื่อได้",
    privacy:
      "ส่งให้ AI เฉพาะคำขอแรกของคุณ และส่งเพียงเพื่อให้เข้าใจว่าคุณต้องการสิ่งใด เมื่อเริ่มการสนทนาแบบทีละขั้นแล้ว จะไม่มีการส่งข้อมูลใดให้ AI อีกเลย ทุกคำถามและคำตอบเขียนไว้ในเว็บไซต์นี้ คำตอบของคุณและผลจากฐานข้อมูลจะไม่ถูกส่งให้ AI และไม่ถูกเก็บเป็นประวัติแชต คำตอบที่กรอกไว้จะเก็บบนเซิร์ฟเวอร์ของเราผูกกับการเข้าสู่ระบบและโดโจของคุณ จะถูกล้างเมื่อออกจากระบบหรือเริ่มใหม่ และจะหมดอายุเองภายในสองชั่วโมง",
    placeholder: "ตัวอย่าง: ค้นหารหัสนักเรียน RSK-1001",
    send: "ส่ง",
    sending: "สักครู่…",
    startOver: "เริ่มใหม่",
    startOverBusy: "กำลังล้างข้อมูล…",
    startOverConfirm:
      "คุณกำลังทำรายการค้างอยู่ การเริ่มใหม่จะล้างคำตอบที่กรอกไว้ ข้อมูลที่บันทึกไปแล้วจะไม่ได้รับผลกระทบ ต้องการเริ่มใหม่หรือไม่",
    startedAgo: (age: string) => `เริ่มเมื่อ ${age}`,
    justNow: "เมื่อสักครู่",
    minutesAgo: (count: number) => `${count} นาทีที่แล้ว`,
    hoursAgo: (count: number) => `${count} ชั่วโมงที่แล้ว`,
    optionalLabel: "ไม่บังคับ",
    answersSoFar: "คำตอบของคุณจนถึงตอนนี้",
    close: "ปิด Admin Auggie",
    open: "เปิดหน้า",
    manual: "ต้องตรวจสอบด้วยตนเอง",
    confirmation: "ข้อความยืนยันที่ตรงกันทุกตัวอักษร",
    secondConfirmation:
      "ข้อความยืนยันครั้งที่สอง (การเงิน หลักฐานการชำระเงิน การลบถาวร เว็บไซต์สาธารณะ หรือการส่งอีเมลจริง)",
    confirm: "ยืนยันการเขียนข้อมูลแยกต่างหาก",
    confirming: "กำลังยืนยันธุรกรรม…",
    undo: "เตรียมการย้อนกลับอย่างปลอดภัย",
    undoing: "กำลังตรวจสอบการย้อนกลับ…",
    expired: "ข้อเสนอนี้หมดอายุแล้ว โปรดขอให้ Auggie เตรียมใหม่",
    resultTitle: "ดำเนินการเสร็จสิ้น",
    resultMessage: "บันทึกการเปลี่ยนแปลงอย่างปลอดภัยแล้ว",
    empty: "ไม่พบระเบียนที่ตรงกันในขอบเขตปัจจุบันของคุณ",
    error: "คำขอล้มเหลวอย่างปลอดภัย ไม่มีการดำเนินการใด ๆ",
    countLabels: {
      pendingProfiles: "คำขอโปรไฟล์",
      pendingExams: "การชำระค่าสอบ",
      pendingAatPayments: "การชำระ AAT",
      pendingTrainingHours: "ชั่วโมงฝึก",
      pendingMonthlyContributions: "เงินสมทบรายเดือน",
      pendingPaymentProofs: "หลักฐานการชำระเงิน",
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
  busyAction,
  confirmation,
  secondConfirmation,
  onConfirmation,
  onSecondConfirmation,
  onConfirm,
  onUndo,
  onNavigate,
}: {
  response: AssistantResponse;
  locale: Locale;
  busyAction: string;
  confirmation: string;
  secondConfirmation: string;
  onConfirmation(value: string): void;
  onSecondConfirmation(value: string): void;
  onConfirm(operation: Operation): void;
  onUndo(operationId: string): void;
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
  const undoAvailable = Boolean(
    result?.operationId &&
    result.undoUntil &&
    Date.parse(result.undoUntil) > Date.now(),
  );

  return (
    <article className="admin-auggie__response">
      <div className="admin-auggie__response-heading">
        <Bot size={18} aria-hidden="true" />
        <h3>{response.heading}</h3>
      </div>
      <p>{response.message}</p>

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
          </dl>
          <p
            className={`admin-auggie__warning${operation.highImpact ? " admin-auggie__warning--high-impact" : ""}`}
          >
            {expired ? text.expired : operation.warning}
          </p>
          {operation.executable && operation.confirmationPhrase && !expired ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onConfirm(operation);
              }}
            >
              <label htmlFor={`admin-auggie-confirm-${operation.id}`}>
                {text.confirmation}
                <code>{operation.confirmationPhrase}</code>
              </label>
              <input
                id={`admin-auggie-confirm-${operation.id}`}
                value={confirmation}
                onChange={(event) => onConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              {operation.secondaryConfirmationPhrase && (
                <>
                  <label htmlFor={`admin-auggie-confirm-2-${operation.id}`}>
                    {text.secondConfirmation}
                    <code>{operation.secondaryConfirmationPhrase}</code>
                  </label>
                  <input
                    id={`admin-auggie-confirm-2-${operation.id}`}
                    value={secondConfirmation}
                    onChange={(event) =>
                      onSecondConfirmation(event.target.value)
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                </>
              )}
              <button
                type="submit"
                disabled={
                  busyAction.length > 0 ||
                  confirmation !== operation.confirmationPhrase ||
                  (Boolean(operation.secondaryConfirmationPhrase) &&
                    secondConfirmation !==
                      operation.secondaryConfirmationPhrase)
                }
              >
                {busyAction === operation.id ? (
                  <LoaderCircle
                    className="admin-auggie__spin"
                    size={17}
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2 size={17} aria-hidden="true" />
                )}
                {busyAction === operation.id ? text.confirming : text.confirm}
              </button>
            </form>
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

      {undoAvailable && result && (
        <button
          type="button"
          className="admin-auggie__undo"
          disabled={busyAction.length > 0}
          onClick={() => onUndo(result.operationId)}
        >
          {busyAction === `undo:${result.operationId}` ? (
            <LoaderCircle
              className="admin-auggie__spin"
              size={17}
              aria-hidden="true"
            />
          ) : (
            <RotateCcw size={17} aria-hidden="true" />
          )}
          {busyAction === `undo:${result.operationId}`
            ? text.undoing
            : text.undo}
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [confirmations, setConfirmations] = useState<Record<string, string>>(
    {},
  );
  const [secondConfirmations, setSecondConfirmations] = useState<
    Record<string, string>
  >({});
  const [flowActive, setFlowActive] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

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
      .then((payload: { response?: AssistantResponse | null } | null) => {
        if (cancelled || !payload?.response) return;
        setItems([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            response: payload.response,
          },
        ]);
        setFlowActive(payload.response.kind === "flow");
      })
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    const latest = message.trim();
    if (!latest || busy) return;
    setMessage("");
    setError("");
    setBusy(true);
    setItems((current) => [
      ...current.slice(-8),
      { id: crypto.randomUUID(), role: "user", text: latest },
    ]);
    try {
      const payload = await requestAuggie<{
        response: AssistantResponse;
      }>(
        "/api/admin/auggie/chat",
        {
          message: latest,
          locale,
          currentPath: location.pathname,
        },
        text.error,
      );
      appendResponse(payload.response);
      setFlowActive(payload.response.kind === "flow");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.error);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  // Clears the saved conversation on the server and empties the panel. A
  // conversation already part way through is confirmed first.
  async function startOver() {
    if (resetting) return;
    if (flowActive && !confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setConfirmingReset(false);
    setResetting(true);
    setError("");
    try {
      await requestAuggie(
        "/api/admin/auggie/reset",
        {
          locale,
          currentPath: location.pathname,
        },
        text.error,
      );
      setItems([]);
      setConfirmations({});
      setSecondConfirmations({});
      setFlowActive(false);
      setMessage("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.error);
    } finally {
      setResetting(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function confirm(operation: Operation) {
    if (busyAction) return;
    setBusyAction(operation.id);
    setError("");
    try {
      const payload = await requestAuggie<{ result: OperationResult }>(
        "/api/admin/auggie/confirm",
        {
          operationId: operation.id,
          phrase: confirmations[operation.id] || "",
          secondPhrase: secondConfirmations[operation.id] || "",
          locale,
        },
        text.error,
      );
      appendResponse({
        kind: "result",
        heading: text.resultTitle,
        message: text.resultMessage,
        result: payload.result,
      });
      setConfirmations((current) => ({ ...current, [operation.id]: "" }));
      setSecondConfirmations((current) => ({
        ...current,
        [operation.id]: "",
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.error);
    } finally {
      setBusyAction("");
    }
  }

  async function undo(operationId: string) {
    if (busyAction) return;
    setBusyAction(`undo:${operationId}`);
    setError("");
    try {
      const payload = await requestAuggie<{ response: AssistantResponse }>(
        "/api/admin/auggie/undo",
        { operationId, locale },
        text.error,
      );
      appendResponse(payload.response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.error);
    } finally {
      setBusyAction("");
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
          <small>{text.privacy}</small>
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
              busyAction={busyAction}
              confirmation={
                item.response.operation
                  ? confirmations[item.response.operation.id] || ""
                  : ""
              }
              secondConfirmation={
                item.response.operation
                  ? secondConfirmations[item.response.operation.id] || ""
                  : ""
              }
              onConfirmation={(value) => {
                const id = item.response.operation?.id;
                if (id)
                  setConfirmations((current) => ({ ...current, [id]: value }));
              }}
              onSecondConfirmation={(value) => {
                const id = item.response.operation?.id;
                if (id)
                  setSecondConfirmations((current) => ({
                    ...current,
                    [id]: value,
                  }));
              }}
              onConfirm={confirm}
              onUndo={undo}
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
            {text.sending}
          </p>
        )}
        {error && (
          <p className="admin-auggie__error" role="alert">
            {error}
          </p>
        )}
        <div ref={logEndRef} />
      </div>

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

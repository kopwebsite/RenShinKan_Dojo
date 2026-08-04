import {
  Bot,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
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
import "./admin-auggie.css";

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

type AssistantResponse = {
  kind: "navigate" | "dashboard" | "students" | "proposal" | "result";
  heading: string;
  message: string;
  path?: string;
  manualOnly?: boolean;
  counts?: Record<string, number>;
  students?: StudentPreview[];
  operation?: Operation;
  result?: OperationResult;
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
      "Ask for a scoped summary, find a student, or open an administration area. Auggie can also prepare student record, rank, training-hour, bulk, newsletter, gallery, website, and dojo changes. Nothing changes until you type the exact confirmation phrase yourself, and a bulk change needs two. Auggie can never inspect private files or upload media.",
    privacy:
      "Only this message is sent to AI. Database results and this conversation are never sent back to the model or stored as a chat transcript.",
    placeholder: "Example: Find Student ID RSK-1001",
    send: "Send",
    sending: "Selecting one safe tool…",
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
      "ขอสรุปตามขอบเขต ค้นหานักเรียน หรือเปิดส่วนงานผู้ดูแลได้ Auggie ยังเตรียมการเปลี่ยนแปลงระเบียนนักเรียน ระดับ ชั่วโมงฝึก การทำงานแบบกลุ่ม จดหมายข่าว แกลเลอรี เว็บไซต์ และโดโจได้ จะไม่มีการเปลี่ยนแปลงใดจนกว่าคุณจะพิมพ์ข้อความยืนยันให้ตรงด้วยตนเอง และการทำงานแบบกลุ่มต้องยืนยันสองครั้ง Auggie ไม่สามารถตรวจไฟล์ส่วนตัวหรืออัปโหลดสื่อได้",
    privacy:
      "ส่งให้ AI เฉพาะข้อความนี้ ผลจากฐานข้อมูลและบทสนทนานี้จะไม่ถูกส่งกลับไปยังโมเดลหรือจัดเก็บเป็นประวัติแชต",
    placeholder: "ตัวอย่าง: ค้นหารหัสนักเรียน RSK-1001",
    send: "ส่ง",
    sending: "กำลังเลือกเครื่องมือที่ปลอดภัยหนึ่งรายการ…",
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
    } as Record<string, string>,
  },
};

async function requestAuggie<T>(url: string, body: Record<string, unknown>) {
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
    throw new Error(payload.error || "Admin Auggie request failed.");
  }
  return payload;
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

function AdminAuggiePanel({
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

  useEffect(() => {
    if (open) logEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [busy, items, open]);

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
      }>("/api/admin/auggie/chat", {
        message: latest,
        locale,
        currentPath: location.pathname,
      });
      appendResponse(payload.response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.error);
    } finally {
      setBusy(false);
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
        <button
          type="button"
          className="admin-auggie__close"
          onClick={onClose}
          aria-label={text.close}
        >
          <X size={21} aria-hidden="true" />
        </button>
      </header>

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

export function AdminAuggieLauncher() {
  const { status, admin } = useAdminSession();
  const { language } = useAdminTranslation();
  const locale: Locale = language === "th" ? "th" : "en";
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (status !== "authenticated" || !admin) setOpen(false);
  }, [admin, status]);

  if (status !== "authenticated" || !admin) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="admin-auggie-launcher"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={copy[locale].label}
        onClick={() => setOpen(true)}
      >
        <Bot size={21} aria-hidden="true" />
        <span>Admin Auggie</span>
      </button>
      {open && (
        <AdminAuggiePanel
          open
          onClose={() => setOpen(false)}
          triggerRef={triggerRef}
        />
      )}
    </>
  );
}

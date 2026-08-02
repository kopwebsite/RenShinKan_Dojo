import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  Info,
  Printer,
  QrCode,
  Search,
  Share2,
  ShieldCheck,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import QRCodeLib from "qrcode";
import { RANKS } from "../../shared/ranks";
import { StudentRecordCard } from "../components/StudentRecordCard";
import {
  PaymentProofUpload,
  type PaymentProofAccess,
} from "../components/PaymentProofUpload";
import { TurnstileWidget } from "../components/TurnstileWidget";
import {
  GregorianDateInput,
  GregorianMonthInput,
} from "../components/GregorianDateInput";
import type { StudentPassportRecord } from "../types/studentRecord";
import { prepareProfilePhoto } from "../utils/profilePhoto";
import { useTranslation, type Language } from "../i18n";
import { useEditableContent } from "../lib/content";
import { formatGregorianMonth } from "../../shared/date";
import { useScopedRecordTranslations } from "../i18n/scopedRecords";
import {
  EXAM_APPLICATION_RANKS,
  examinationFeeThb,
  formatThb,
} from "../../shared/examFees";

type Task = "lookup" | "profile" | "exam";
type LookupResult = {
  record: StudentPassportRecord;
  shareUrl: string;
  accessToken: string;
};
type ProfileCreationResult = {
  ok: true;
  requestId: string;
  status: "pending_admin_approval";
  studentName: string;
  studentId: string;
  hasAatMembership: boolean;
  record?: StudentPassportRecord;
  shareUrl?: string;
  accessToken?: string;
};
type PublicDojo = {
  id: string;
  official_name: string;
  short_name: string;
  code: string;
  logo_url: string;
};
const LOOKUP_VERIFICATION_PENDING =
  "Cloudflare verification is still finishing. Wait for the confirmation, then try again.";
const AAT_ONLINE_REGISTRATION_URL =
  "https://thaiaikikai-registration.com/forms";
type ExamDraft = {
  verificationName: string;
  studentId: string;
  dojoId: string;
  attemptedRank: string;
  aatNumber: string;
  firstName: string;
  surname: string;
  nationality: string;
  sex: string;
  dateOfBirth: string;
  permanentAddress: string;
  presentAddress: string;
  phoneCountry: string;
  phoneCallingCode: string;
  phone: string;
  occupationType: "" | "student" | "employed" | "both" | "not_applicable";
  school: string;
  classLevel: string;
  office: string;
  position: string;
  certificate: string;
  gamesExperience: string;
  applicantSignature: string;
  promiseAccepted: boolean;
};

const EMPTY_EXAM: ExamDraft = {
  verificationName: "",
  studentId: "",
  dojoId: "",
  attemptedRank: "10 Kyu",
  aatNumber: "",
  firstName: "",
  surname: "",
  nationality: "",
  sex: "",
  dateOfBirth: "",
  permanentAddress: "",
  presentAddress: "",
  phoneCountry: "Thailand",
  phoneCallingCode: "+66",
  phone: "",
  occupationType: "",
  school: "",
  classLevel: "",
  office: "",
  position: "",
  certificate: "",
  gamesExperience: "",
  applicantSignature: "",
  promiseAccepted: false,
};

const AAT_PAYMENT_HELP: Record<
  Language,
  { status: string; explanation: string }
> = {
  en: {
    status: "Not yet paid or payment date unknown.",
    explanation:
      "Aikido members from all participating dojos are requested to make an annual contribution to the Aikido Association of Thailand.",
  },
  th: {
    status: "ยังไม่ได้ชำระหรือไม่ทราบวันที่ชำระ",
    explanation:
      "สมาชิกไอคิโดจากโดโจที่เข้าร่วมทุกแห่งได้รับการขอความร่วมมือให้ชำระเงินสนับสนุนรายปีแก่สมาคมไอคิโดแห่งประเทศไทย",
  },
  ja: {
    status: "未納、または支払日が不明です。",
    explanation:
      "参加するすべての道場の合気道会員には、タイ合気道協会への年会費の納付をお願いしています。",
  },
  "zh-CN": {
    status: "尚未缴费或缴费日期未知。",
    explanation: "所有参与道场的合气道会员均需每年向泰国合气道协会缴纳会费。",
  },
};

const PHONE_COUNTRIES = [
  ["Thailand", "+66"],
  ["Argentina", "+54"],
  ["Australia", "+61"],
  ["Austria", "+43"],
  ["Bangladesh", "+880"],
  ["Belgium", "+32"],
  ["Brazil", "+55"],
  ["Cambodia", "+855"],
  ["Canada", "+1"],
  ["China", "+86"],
  ["Denmark", "+45"],
  ["Finland", "+358"],
  ["France", "+33"],
  ["Germany", "+49"],
  ["Hong Kong", "+852"],
  ["India", "+91"],
  ["Indonesia", "+62"],
  ["Ireland", "+353"],
  ["Israel", "+972"],
  ["Italy", "+39"],
  ["Japan", "+81"],
  ["Laos", "+856"],
  ["Malaysia", "+60"],
  ["Mexico", "+52"],
  ["Myanmar", "+95"],
  ["Nepal", "+977"],
  ["Netherlands", "+31"],
  ["New Zealand", "+64"],
  ["Norway", "+47"],
  ["Pakistan", "+92"],
  ["Philippines", "+63"],
  ["Poland", "+48"],
  ["Portugal", "+351"],
  ["Russia", "+7"],
  ["Singapore", "+65"],
  ["South Africa", "+27"],
  ["South Korea", "+82"],
  ["Spain", "+34"],
  ["Sri Lanka", "+94"],
  ["Sweden", "+46"],
  ["Switzerland", "+41"],
  ["Taiwan", "+886"],
  ["Turkey", "+90"],
  ["United Arab Emirates", "+971"],
  ["United Kingdom", "+44"],
  ["United States", "+1"],
  ["Vietnam", "+84"],
] as const;

function approximatePracticeDuration(value: string) {
  return formatGregorianMonth(value, "");
}

function FreeTextPreference() {
  const { t } = useTranslation();
  return (
    <small className="free-text-language-help">
      {t("forms.freeTextPreference")}
    </small>
  );
}

const EXAM_REVIEW_LABELS: Partial<Record<keyof ExamDraft, string>> = {
  verificationName: "Student name in English",
  studentId: "Student ID",
  dojoId: "Current dojo",
  attemptedRank: "Kyu rank applying to test for",
  aatNumber: "AAT membership number",
  firstName: "Given name",
  surname: "Family name / surname",
  dateOfBirth: "Date of birth",
  permanentAddress: "Permanent (registered) address",
  presentAddress: "Current address",
  phoneCountry: "Country calling code",
  phone: "Telephone number",
  occupationType: "School or employment status",
  classLevel: "Class / year level",
  office: "Employer / office",
  position: "Position / job title",
  certificate: "Relevant certificates or qualifications",
  gamesExperience: "Aikido, martial arts, or sports experience",
  applicantSignature: "Applicant signature",
};

const OCCUPATION_LABELS: Record<ExamDraft["occupationType"], string> = {
  "": "",
  student: "Student",
  employed: "Employed",
  both: "Student and employed",
  not_applicable: "Not currently studying or employed",
};

function ExamFieldCopy({
  label,
  optional = false,
  help,
}: {
  label: string;
  optional?: boolean;
  help?: string;
}) {
  return (
    <span className="exam-field-copy">
      <span>
        <strong>{label}</strong>
        <b className={optional ? "is-optional" : "is-required"}>
          {optional ? "Optional" : "Required"}
        </b>
      </span>
      {help ? <small>{help}</small> : null}
    </span>
  );
}

function ExamSectionLegend({ title, copy }: { title: string; copy: string }) {
  return (
    <legend>
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
    </legend>
  );
}

async function responseBody<T>(response: Response) {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(body.error || "Please check the form and try again.");
  return body;
}

export function StudentRecordsPage() {
  const { language } = useTranslation();
  const translationScope = useRef<HTMLDivElement>(null);
  useScopedRecordTranslations(translationScope, language);
  const taskFromUrl = () => {
    const value = new URLSearchParams(window.location.search).get("task");
    return value === "profile" || value === "exam" ? value : "lookup";
  };
  const [task, setTask] = useState<Task>(taskFromUrl);
  const [createdRecord, setCreatedRecord] = useState<LookupResult | null>(null);
  useEffect(() => {
    const onPopState = () => setTask(taskFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  function chooseTask(value: Task) {
    const url = new URL(window.location.href);
    if (value === "lookup") url.searchParams.delete("task");
    else url.searchParams.set("task", value);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setTask(value);
  }
  return (
    <div ref={translationScope} className="student-records-localized">
      <section className="container-shell records-opening">
        <div>
          <p className="folio-mark">Student records</p>
          <h1>Student workspace</h1>
          <p>
            Find your passport, request a profile, or prepare an examination
            application.
          </p>
        </div>
      </section>
      <nav
        className="container-shell record-workspace-tabs"
        aria-label="Student workspace sections"
      >
        {(
          [
            ["lookup", Search, "My passport", "Usable profile and training"],
            ["profile", UserPlus, "New profile", "Create a usable profile"],
            [
              "exam",
              FileCheck2,
              "Exam application",
              "Apply and continue to payment",
            ],
          ] as const
        ).map(([value, Icon, title, copy]) => (
          <button
            key={value}
            className={task === value ? "is-active" : ""}
            onClick={() => chooseTask(value)}
            aria-pressed={task === value}
          >
            <Icon />
            <span>
              <strong>{title}</strong>
              <small>{copy}</small>
            </span>
          </button>
        ))}
      </nav>
      <section className="container-shell record-task-panel">
        {task === "lookup" ? (
          <LookupWorkflow initialResult={createdRecord} />
        ) : task === "profile" ? (
          <ProfileWorkflow
            onOpenRecord={(result) => {
              setCreatedRecord(result);
              chooseTask("lookup");
            }}
            onBack={() => {
              setCreatedRecord(null);
              chooseTask("lookup");
            }}
          />
        ) : (
          <ExamWorkflow />
        )}
      </section>
    </div>
  );
}

function LookupWorkflow({ initialResult = null }: { initialResult?: LookupResult | null }) {
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [token, setToken] = useState("");
  const [result, setResult] = useState<LookupResult | null>(initialResult);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; studentId?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(0);
  const [qr, setQr] = useState("");
  const [training, setTraining] = useState({
    hours: "",
    trainingDate: "",
    sourceType: "" as "" | "renshinkan" | "aat" | "other",
    organization: "",
    sourceDetails: "",
    notes: "",
  });
  const [hoursMessage, setHoursMessage] = useState("");
  const onToken = useCallback((value: string) => {
    setToken(value);
    if (value)
      setError((current) =>
        current === LOOKUP_VERIFICATION_PENDING ? "" : current,
      );
  }, []);
  useEffect(() => {
    if (initialResult) setResult(initialResult);
  }, [initialResult]);
  useEffect(() => {
    if (result?.shareUrl)
      QRCodeLib.toDataURL(result.shareUrl, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: "M",
      }).then(setQr);
  }, [result?.shareUrl]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    const nextErrors = {
      ...(!name.trim() ? { name: "Enter the student name." } : {}),
      ...(!studentId.trim() ? { studentId: "Enter the Student ID." } : {}),
    };
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return;
    }
    if (!token) {
      setError(LOOKUP_VERIFICATION_PENDING);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/records/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": crypto.randomUUID(),
        },
        body: JSON.stringify({
          name,
          studentId,
          turnstileToken: token,
        }),
      });
      setResult(await responseBody<LookupResult>(response));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Check the name and Student ID and try again.",
      );
    } finally {
      setBusy(false);
      setToken("");
      setReset((value) => value + 1);
    }
  }
  async function submitHours(event: FormEvent) {
    event.preventDefault();
    if (!result?.accessToken) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/records/hours", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": crypto.randomUUID(),
        },
        body: JSON.stringify({
          studentId: result.record.studentId,
          accessToken: result.accessToken,
          ...training,
          hours: Number(training.hours),
        }),
      });
      const body = await responseBody<{ requestedTotal: number }>(response);
      setHoursMessage(
        `Submitted for administrator review. Your requested total is ${body.requestedTotal} hours; your approved total has not changed yet.`,
      );
      setTraining({
        hours: "",
        trainingDate: "",
        sourceType: "",
        organization: "",
        sourceDetails: "",
        notes: "",
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The hours request could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copyLink() {
    if (result) {
      await navigator.clipboard.writeText(result.shareUrl);
      setHoursMessage("Profile link copied.");
    }
  }
  async function shareLink() {
    if (!result) return;
    if (navigator.share)
      await navigator.share({
        title: `${result.record.displayName} · RenShinKan`,
        url: result.shareUrl,
      });
    else await copyLink();
  }
  return (
    <>
      <div
        className={`records-layout${result ? " records-layout--passport" : ""}`}
      >
        <form className="record-lookup" onSubmit={submit}>
          <p className="eyebrow">Existing student</p>
          <h2>Look up your student record</h2>
          <p>Enter the name used on your profile and your Student ID.</p>
          <label htmlFor="record-student-name">
            Student name
            <input
              id="record-student-name"
              name="studentName"
              value={name}
              onChange={(event) => { setName(event.target.value); setFieldErrors((current) => ({ ...current, name: undefined })); }}
              autoComplete="name"
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "record-student-name-error" : undefined}
              required
            />
            {fieldErrors.name ? <small id="record-student-name-error" className="field-error">{fieldErrors.name}</small> : null}
          </label>
          <label htmlFor="record-student-id">
            Student ID{" "}
            <small id="record-student-id-format">Example: RSK-2601.</small>
            <input
              id="record-student-id"
              name="studentId"
              value={studentId}
              onChange={(event) => { setStudentId(event.target.value.toUpperCase()); setFieldErrors((current) => ({ ...current, studentId: undefined })); }}
              placeholder="RSK-2601"
              aria-invalid={Boolean(fieldErrors.studentId)}
              aria-describedby={`record-student-id-format${fieldErrors.studentId ? " record-student-id-error" : ""}`}
              required
            />
            {fieldErrors.studentId ? <small id="record-student-id-error" className="field-error">{fieldErrors.studentId}</small> : null}
          </label>
          <TurnstileWidget onToken={onToken} resetSignal={reset} />
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn-primary" disabled={busy || !token}>
            <Search size={17} /> {busy ? "Checking…" : "Find my record"}
          </button>
          <p className="record-privacy">
            <ShieldCheck size={15} /> The name and Student ID are sent securely and never placed in the page URL.
          </p>
        </form>
        {result ? (
          <StudentRecordCard
            record={result.record}
            onRecordChange={(record) =>
              setResult((current) =>
                current ? { ...current, record } : current,
              )
            }
          />
        ) : (
          <div className="record-placeholder">
            <span>認</span>
            <h2>Your student record will appear here</h2>
            <p>
              Public profile links never allow editing and never reveal
              application answers or payment details.
            </p>
          </div>
        )}
      </div>
      {result ? (
        <section id="student-record-tools" className="student-owner-tools">
          <header>
            <QrCode />
            <div>
              <h2>Student record QR</h2>
              <p>
                This opens your public training record. It is not a payment QR.
              </p>
            </div>
          </header>
          <div className="student-owner-tools__grid">
            {qr ? <img src={qr} alt="Student record QR code" /> : null}
            <div>
              <label>
                Public student record link
                <input
                  readOnly
                  value={result.shareUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <div>
                <button
                  className="btn-secondary"
                  onClick={() => void copyLink()}
                >
                  <Copy size={16} /> Copy link
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => void shareLink()}
                >
                  <Share2 size={16} /> Share
                </button>
                <a
                  className="btn-secondary"
                  download={`${result.record.studentId}-profile-qr.png`}
                  href={qr}
                >
                  <Download size={16} /> Download QR
                </a>
                <button
                  className="btn-secondary"
                  onClick={() => window.print()}
                >
                  <Printer size={16} /> Print
                </button>
              </div>
            </div>
          </div>
          <form
            id="student-hours-form"
            className="student-hours-form student-hours-form--detailed"
            onSubmit={submitHours}
          >
            <div className="admin-span-2">
              <h3>Submit additional training hours</h3>
              <p>
                A sensei will review the source and date before the approved
                total changes.
              </p>
            </div>
            <label>
              Training date
              <GregorianDateInput
                value={training.trainingDate}
                onChange={(value) =>
                  setTraining({ ...training, trainingDate: value })
                }
                required
              />
            </label>
            <label>
              Hours to add
              <input
                type="number"
                min="0.25"
                max="1000"
                step="0.25"
                value={training.hours}
                onChange={(event) =>
                  setTraining({ ...training, hours: event.target.value })
                }
                required
              />
            </label>
            <label>
              Source of training
              <select
                value={training.sourceType}
                onChange={(event) =>
                  setTraining({
                    ...training,
                    sourceType: event.target
                      .value as typeof training.sourceType,
                    sourceDetails:
                      event.target.value === "other"
                        ? training.sourceDetails
                        : "",
                  })
                }
                required
              >
                <option value="">Choose a source</option>
                <option value="renshinkan">RenShinKan Dojo</option>
                <option value="aat">AAT seminar or participating dojo</option>
                <option value="other">Other organization or dojo</option>
              </select>
            </label>
            <label>
              Organization or dojo
              <input
                value={training.organization}
                maxLength={160}
                onChange={(event) =>
                  setTraining({ ...training, organization: event.target.value })
                }
                placeholder="Optional name"
              />
            </label>
            {training.sourceType === "other" ? (
              <label className="admin-span-2">
                Other source details
                <input
                  value={training.sourceDetails}
                  maxLength={240}
                  onChange={(event) =>
                    setTraining({
                      ...training,
                      sourceDetails: event.target.value,
                    })
                  }
                  required
                />
              </label>
            ) : null}
            <label className="admin-span-2">
              Notes for the reviewer
              <textarea
                value={training.notes}
                maxLength={1000}
                onChange={(event) =>
                  setTraining({ ...training, notes: event.target.value })
                }
                placeholder="Optional class, seminar, or period details"
              />
            </label>
            <button
              className="btn-primary admin-span-2"
              disabled={
                busy ||
                !(Number(training.hours) > 0) ||
                !training.trainingDate ||
                !training.sourceType
              }
            >
              Submit for review
            </button>
          </form>
          {hoursMessage ? (
            <p className="form-success">
              <CheckCircle2 /> {hoursMessage}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function ProfileWorkflow({ onOpenRecord, onBack }: {
  onOpenRecord: (result: LookupResult) => void;
  onBack: () => void;
}) {
  const { language } = useTranslation();
  const aatHelp = AAT_PAYMENT_HELP[language];
  const [draft, setDraft] = useState({
    englishName: "",
    thaiName: "",
    currentRank: "Unranked",
    dojoId: "",
    aatNumber: "",
    aatLastPaidDate: "",
    hasAatMembership: false,
    practiceStartMonth: "",
  });
  const [dojos, setDojos] = useState<PublicDojo[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [token, setToken] = useState("");
  const [reset, setReset] = useState(0);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProfileCreationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const errorSummary = useRef<HTMLDivElement>(null);
  const successPanel = useRef<HTMLDivElement>(null);
  const onToken = useCallback((value: string) => {
    setToken(value);
    if (value) setFieldErrors((current) => ({ ...current, verification: "" }));
  }, []);
  useEffect(() => {
    fetch("/api/dojos")
      .then((response) => response.json() as Promise<{ dojos?: PublicDojo[] }>)
      .then((body) => setDojos(body.dojos || []))
      .catch(() =>
        setError("The dojo list could not be loaded. Please try again."),
      );
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    if (result) requestAnimationFrame(() => successPanel.current?.focus());
  }, [result]);
  async function choose(input?: File) {
    if (!input) return;
    setPhotoBusy(true);
    try {
      const prepared = await prepareProfilePhoto(input);
      if (preview) URL.revokeObjectURL(preview);
      setFile(prepared);
      setPreview(URL.createObjectURL(prepared));
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The photo could not be prepared.",
      );
    } finally {
      setPhotoBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!draft.englishName.trim()) nextErrors.englishName = "Enter the English name used for record lookup.";
    if (!draft.dojoId) nextErrors.dojoId = "Choose the student's current dojo.";
    if (draft.hasAatMembership && !draft.aatLastPaidDate)
      nextErrors.aatLastPaidDate = "Enter the most recent AAT payment date, or turn off AAT membership.";
    if (!token) nextErrors.verification = "Complete Cloudflare verification.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError("Review the highlighted fields and try again.");
      requestAnimationFrame(() => errorSummary.current?.focus());
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      const { practiceStartMonth, ...profileDetails } = draft;
      data.set(
        "payload",
        JSON.stringify({
          ...profileDetails,
          practiceDuration: approximatePracticeDuration(practiceStartMonth),
          aatNumber: draft.hasAatMembership ? draft.aatNumber : null,
          aatLastPaidDate: draft.hasAatMembership
            ? draft.aatLastPaidDate
            : null,
          turnstileToken: token,
        }),
      );
      if (file) data.set("file", file);
      const response = await fetch("/api/records/profile-requests", {
        method: "POST",
        headers: { "X-Request-ID": requestId.current },
        body: data,
      });
      const created = await responseBody<ProfileCreationResult>(response);
      setResult(created);
      requestId.current = crypto.randomUUID();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The profile request could not be submitted.",
      );
      setReset((value) => value + 1);
      setToken("");
      requestAnimationFrame(() => errorSummary.current?.focus());
    } finally {
      setBusy(false);
    }
  }
  if (result)
    return (
      <div ref={successPanel} className="record-success-panel profile-created" tabIndex={-1} aria-labelledby="profile-created-title">
        <CheckCircle2 className="profile-created__icon" aria-hidden="true" />
        <p className="eyebrow">Profile created</p>
        <h2 id="profile-created-title">Your student profile is ready</h2>
        <p>You can start using your student profile now. An administrator will review the information later.</p>
        <dl className="profile-created__credentials">
          <div><dt>Name used for access</dt><dd>{result.studentName}</dd></div>
          <div><dt>Student ID</dt><dd><input aria-label="Your new Student ID" readOnly value={result.studentId} onFocus={(event) => event.currentTarget.select()} /><button type="button" className="btn-secondary" onClick={() => void navigator.clipboard.writeText(result.studentId).then(() => setCopied(true))}><Copy size={16} aria-hidden="true" /> {copied ? "Copied" : "Copy ID"}</button></dd></div>
          <div><dt>Status</dt><dd><span className="admin-status is-pending"><Clock3 size={15} aria-hidden="true" /> Pending administrator review</span></dd></div>
        </dl>
        <div className="profile-created__notice"><Info aria-hidden="true" /><p>Save or photograph these details. You will use this name and Student ID to open your profile. An administrator may correct the Student ID during review; if it changes, this original ID will still open the same profile.</p></div>
        <section className="profile-created__next">
          <h3>You may now use your student profile to:</h3>
          <ul>
            <li>Apply for kyu examinations.</li>
            <li>Submit RenShinKan monthly contributions, when applicable.</li>
            <li>View and update your student portfolio.</li>
            <li>Share your portfolio with another dojo or gym.</li>
          </ul>
        </section>
        {!result.hasAatMembership ? (
          <section className="aat-next-step-card">
            <p className="eyebrow">Optional AAT membership</p>
            <h3>You can register on paper or online</h3>
            <p>AAT membership is optional here. If you decide to join, use either route below.</p>
            <div>
              <a
                className="btn-primary"
                href="/downloads/aat-membership-application-en-th-2026.pdf"
                download
              >
                <Download aria-hidden="true" /> Download AAT application
              </a>
              <a
                className="btn-secondary"
                href={AAT_ONLINE_REGISTRATION_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink aria-hidden="true" /> Register online{" "}
                <span className="sr-only">(opens an external website)</span>
              </a>
            </div>
            <small>
              The online registration link leaves the RenShinKan website.
            </small>
          </section>
        ) : null}
        <div className="profile-created__actions">
          {result.record && result.shareUrl && result.accessToken ? <button className="btn-primary" type="button" onClick={() => onOpenRecord({ record: result.record!, shareUrl: result.shareUrl!, accessToken: result.accessToken! })}><UserRound size={17} aria-hidden="true" /> Open my student profile</button> : null}
          <button className="btn-secondary" type="button" onClick={onBack}>Back to student-record landing page</button>
        </div>
      </div>
    );
  return (
    <form className="student-long-form student-profile-form" onSubmit={submit} noValidate>
      <header>
        <div>
          <p className="eyebrow">New student profile</p>
          <h2>Create your student profile</h2>
          <p>Complete the required details first. Optional membership and photo details can be added now or later.</p>
        </div>
        <span className="admin-status is-pending">Usable immediately · review pending</span>
      </header>
      {error ? <div ref={errorSummary} className="profile-error-summary" role="alert" tabIndex={-1}><AlertCircle aria-hidden="true" /><div><strong>{error}</strong>{Object.values(fieldErrors).filter(Boolean).length ? <ul>{Object.values(fieldErrors).filter(Boolean).map((message) => <li key={message}>{message}</li>)}</ul> : null}</div></div> : null}
      <div className="profile-form-sections">
        <fieldset className="profile-form-section">
          <legend><span>1</span><div><strong>Basic information</strong><small>Your English name is the name you will use to look up this profile.</small></div></legend>
          <div className="student-form-grid">
        <label htmlFor="new-profile-english-name">
          <span className="student-field-copy">
            English name{" "}
            <small>
              Required · use the name you will use for record lookup.
            </small>
          </span>
          <input
            id="new-profile-english-name"
            name="englishName"
            autoComplete="name"
            value={draft.englishName}
            onChange={(event) => { setDraft({ ...draft, englishName: event.target.value }); setFieldErrors((current) => ({ ...current, englishName: "" })); }}
            aria-invalid={Boolean(fieldErrors.englishName)}
            aria-describedby={fieldErrors.englishName ? "new-profile-english-name-error" : undefined}
            required
          />
          {fieldErrors.englishName ? <small id="new-profile-english-name-error" className="field-error">{fieldErrors.englishName}</small> : null}
        </label>
        <label>
          <span className="student-field-copy">
            Thai name{" "}
            <small>
              Optional · enter your name in Thai script if you use one.
            </small>
          </span>
          <input
            name="thaiName"
            lang="th"
            value={draft.thaiName}
            onChange={(event) =>
              setDraft({ ...draft, thaiName: event.target.value })
            }
          />
        </label>
        <label>
          <span className="student-field-copy">Current kyu</span>
          <select
            value={draft.currentRank}
            onChange={(event) =>
              setDraft({ ...draft, currentRank: event.target.value })
            }
          >
            {RANKS.map((rank) => (
              <option key={rank}>{rank}</option>
            ))}
          </select>
        </label>
        <label htmlFor="new-profile-dojo">
          <span className="student-field-copy">
            Current dojo{" "}
            <small>Choose the dojo where you currently study or train.</small>
          </span>
          <select
            id="new-profile-dojo"
            value={draft.dojoId}
            onChange={(event) => { setDraft({ ...draft, dojoId: event.target.value }); setFieldErrors((current) => ({ ...current, dojoId: "" })); }}
            aria-invalid={Boolean(fieldErrors.dojoId)}
            aria-describedby={fieldErrors.dojoId ? "new-profile-dojo-error" : undefined}
            required
          >
            <option value="">Choose a dojo</option>
            {dojos.map((dojo) => (
              <option key={dojo.id} value={dojo.id}>
                {dojo.official_name}
              </option>
            ))}
          </select>
          {fieldErrors.dojoId ? <small id="new-profile-dojo-error" className="field-error">{fieldErrors.dojoId}</small> : null}
        </label>
          </div>
        </fieldset>
        <fieldset className="profile-form-section">
          <legend><span>2</span><div><strong>Aikido background</strong><small>Tell us roughly when you began training.</small></div></legend>
          <div className="student-form-grid">
        <fieldset className="student-practice-start admin-span-2">
          <legend className="student-field-copy">
            Approximately when did you start aikido? <small>Optional</small>
            <small id="practice-start-help">
              Choose a month and Gregorian year if you remember. An approximate answer is fine.
            </small>
          </legend>
          <GregorianMonthInput
            name="practiceStartMonth"
            aria-describedby="practice-start-help"
            value={draft.practiceStartMonth}
            onChange={(value) => setDraft({ ...draft, practiceStartMonth: value })}
          />
        </fieldset>
          </div>
        </fieldset>
        <fieldset
          className={`profile-form-section student-aat-card${draft.hasAatMembership ? " is-paid" : ""}`}
        >
          <legend>
            <span>3</span><div><strong>AAT annual membership</strong><small>Optional</small></div>
          </legend>
          <p className="student-aat-intro">
            Already registered with the Aikido Association of Thailand? Add your membership details for review.
          </p>
          <div className="student-aat-card__grid">
            <label className="student-aat-paid-toggle">
              <input
                type="checkbox"
                checked={draft.hasAatMembership}
                onChange={(event) => {
                  setDraft({
                    ...draft,
                    hasAatMembership: event.target.checked,
                    aatNumber: event.target.checked ? draft.aatNumber : "",
                    aatLastPaidDate: event.target.checked
                      ? draft.aatLastPaidDate
                      : "",
                  });
                  if (!event.target.checked) setFieldErrors((current) => ({ ...current, aatLastPaidDate: "" }));
                }}
              />
              <span>
                <strong>I already have a current AAT membership</strong>
                <small>
                  Select this to add your membership details for review.
                </small>
              </span>
            </label>
            {draft.hasAatMembership ? (
              <>
                <label>
                  <span className="student-field-copy">
                    AAT membership number{" "}
                    <small>
                      Enter the number shown on your membership record.
                    </small>
                  </span>
                  <input
                    name="aatNumber"
                    maxLength={40}
                    value={draft.aatNumber}
                    onChange={(event) =>
                      setDraft({ ...draft, aatNumber: event.target.value })
                    }
                  />
                </label>
                <label className="student-aat-payment-date">
                  <span className="student-field-copy">
                    Most recent AAT payment date{" "}
                    <small>
                      Self-reported until an administrator confirms it.
                    </small>
                  </span>
                  <GregorianDateInput
                    name="aatLastPaidDate"
                    value={draft.aatLastPaidDate}
                    onChange={(value) => { setDraft({ ...draft, aatLastPaidDate: value }); setFieldErrors((current) => ({ ...current, aatLastPaidDate: "" })); }}
                    aria-invalid={Boolean(fieldErrors.aatLastPaidDate)}
                    aria-describedby={fieldErrors.aatLastPaidDate ? "new-profile-aat-date-error" : undefined}
                    required
                  />
                  {fieldErrors.aatLastPaidDate ? <small id="new-profile-aat-date-error" className="field-error">{fieldErrors.aatLastPaidDate}</small> : null}
                </label>
              </>
            ) : (
              <div className="student-aat-note">
                <Info aria-hidden="true" />
                <div>
                  <strong title={aatHelp.status}>No membership yet?</strong>
                  <p>You can finish the AAT application after creating your profile.</p>
                </div>
              </div>
            )}
          </div>
        </fieldset>
      </div>
      <fieldset className="profile-form-section">
        <legend><span>4</span><div><strong>Profile photo</strong><small>Optional · add a clear portrait now or from your profile later.</small></div></legend>
      <label className="student-photo-field" aria-label="Choose a profile photo">
        <span>
          {preview ? (
            <img src={preview} alt="Profile preview" />
          ) : (
            <UserRound aria-hidden="true" />
          )}
        </span>
        <strong>
          <Camera size={18} aria-hidden="true" /> {photoBusy ? "Preparing photo…" : preview ? "Replace profile photo" : "Choose profile photo"}
        </strong>
        <small id="profile-photo-help">
          Choose one from your photo library or take a new photo. JPEG, PNG,
          WebP, HEIC, or HEIF; up to 8 MB and at least 128 × 128 pixels.
        </small>
        <input
          type="file"
          accept="image/*"
          aria-describedby="profile-photo-help"
          disabled={photoBusy || busy}
          onChange={(event) => void choose(event.target.files?.[0])}
        />
      </label>
      {photoBusy ? <p className="profile-photo-state" role="status">Preparing your photo…</p> : preview ? <p className="profile-photo-state" role="status">Photo ready to upload.</p> : null}
      {preview ? <button className="btn-secondary profile-photo-remove" type="button" disabled={photoBusy || busy} onClick={() => { URL.revokeObjectURL(preview); setPreview(""); setFile(null); }}><X size={16} aria-hidden="true" /> Remove photo</button> : null}
      </fieldset>
      <fieldset className="profile-form-section profile-review-section">
        <legend><span>5</span><div><strong>Review and create</strong><small>Your Student ID will be generated securely when this form is accepted.</small></div></legend>
        <dl className="profile-review-summary">
          <div><dt>Name</dt><dd>{draft.englishName.trim() || "Not entered"}</dd></div>
          <div><dt>Dojo</dt><dd>{dojos.find((dojo) => dojo.id === draft.dojoId)?.official_name || "Not selected"}</dd></div>
          <div><dt>Current rank</dt><dd>{draft.currentRank}</dd></div>
          <div><dt>AAT membership</dt><dd>{draft.hasAatMembership ? "Included for review" : "Not added"}</dd></div>
          <div><dt>Photo</dt><dd>{file ? "Ready to upload" : "Not added"}</dd></div>
        </dl>
      <TurnstileWidget onToken={onToken} resetSignal={reset} />
      {fieldErrors.verification ? <p className="field-error" role="alert">{fieldErrors.verification}</p> : null}
      <p className="profile-submit-status"><Clock3 aria-hidden="true" /> The profile will be usable immediately with a Pending administrator review status.</p>
      <button className="btn-primary" disabled={busy || photoBusy}>
        {busy ? "Creating profile…" : "Create student profile"}
      </button>
      </fieldset>
    </form>
  );
}

function ExamWorkflow() {
  const { content } = useEditableContent();
  const [draft, setDraft] = useState<ExamDraft>(EMPTY_EXAM);
  const [dojos, setDojos] = useState<PublicDojo[]>([]);
  const [stage, setStage] = useState<"form" | "review" | "done">("form");
  const [token, setToken] = useState("");
  const [reset, setReset] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [feeSnapshotThb, setFeeSnapshotThb] = useState<number | null>(null);
  const [proofAccess, setProofAccess] = useState<PaymentProofAccess | null>(
    null,
  );
  const onToken = useCallback((value: string) => setToken(value), []);
  useEffect(() => {
    fetch("/api/dojos")
      .then((response) => response.json() as Promise<{ dojos?: PublicDojo[] }>)
      .then((body) => setDojos(body.dojos || []))
      .catch(() =>
        setError("The dojo list could not be loaded. Please try again."),
      );
  }, []);
  function set<K extends keyof ExamDraft>(key: K, value: ExamDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function setOccupation(value: ExamDraft["occupationType"]) {
    setDraft((current) => ({
      ...current,
      occupationType: value,
      school: value === "student" || value === "both" ? current.school : "",
      classLevel:
        value === "student" || value === "both" ? current.classLevel : "",
      office: value === "employed" || value === "both" ? current.office : "",
      position:
        value === "employed" || value === "both" ? current.position : "",
    }));
  }
  function review(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStage("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function submit() {
    if (!token) {
      setError("Complete Cloudflare verification before submitting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/records/examination-applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": crypto.randomUUID(),
        },
        body: JSON.stringify({ ...draft, turnstileToken: token }),
      });
      const body = await responseBody<
        { applicationId: string; feeSnapshotThb: number } & PaymentProofAccess
      >(response);
      setApplicationId(body.applicationId);
      setFeeSnapshotThb(body.feeSnapshotThb);
      setProofAccess({ proofId: body.proofId, uploadToken: body.uploadToken });
      setStage("done");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The application could not be submitted.",
      );
      setToken("");
      setReset((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  if (stage === "done")
    return (
      <div className="exam-payment-panel">
        <AlertMark />
        <p className="eyebrow">Application {applicationId.slice(0, 8)}</p>
        <h2>Application submitted · payment still required</h2>
        <p>
          The application and payment are separate statuses. Your application is
          recorded; the payment remains pending until a sensei approves the
          uploaded proof.
        </p>
        <div className="exam-fee-summary">
          <span>Examination fee snapshot</span>
          <strong>{formatThb(feeSnapshotThb || 0)}</strong>
          <small>Fixed when this application was submitted.</small>
        </div>
        <div className="exam-payment-grid">
          <figure className="exam-payment-qr">
            <img
              src={content.paymentQr.src}
              alt={content.paymentQr.alt}
              width={720}
              height={720}
            />
            <figcaption>Scan with your banking app</figcaption>
          </figure>
          <section className="exam-payment-instructions">
            <p className="eyebrow">Finish your payment</p>
            <h3>Three steps remain</h3>
            <ol className="exam-payment-steps">
              <li>
                <strong>Pay {formatThb(feeSnapshotThb || 0)}</strong>
                <span>
                  Scan the PromptPay QR and complete the examination payment.
                </span>
              </li>
              <li>
                <strong>Upload</strong>
                <span>Add the payment proof using the button below.</span>
              </li>
              <li>
                <strong>Review</strong>
                <span>
                  A sensei will check the proof and confirm the payment.
                </span>
              </li>
            </ol>
            <p className="exam-payment-distinction">
              <strong>Payment QR</strong>
              <span>
                This is different from your shareable student-profile QR code.
              </span>
            </p>
          </section>
        </div>
        {proofAccess ? (
          <PaymentProofUpload
            access={proofAccess}
            paymentLabel={`${formatThb(feeSnapshotThb || 0)} examination fee`}
          />
        ) : null}
      </div>
    );
  if (stage === "review") {
    const reviewDraft = {
      ...draft,
      dojoId:
        dojos.find((dojo) => dojo.id === draft.dojoId)?.official_name ||
        draft.dojoId,
      occupationType: OCCUPATION_LABELS[draft.occupationType],
      phoneCountry: `${draft.phoneCountry} (${draft.phoneCallingCode})`,
      phone: `${draft.phoneCallingCode} ${draft.phone}`,
    };
    return (
      <div className="student-long-form exam-review">
        <header>
          <div>
            <p className="eyebrow">Step 2 of 2</p>
            <h2>Review your application</h2>
            <p>Check each answer before submitting it to the dojo.</p>
          </div>
          <button className="btn-secondary" onClick={() => setStage("form")}>
            Edit answers
          </button>
        </header>
        <div className="exam-fee-summary">
          <span>Fee for {draft.attemptedRank}</span>
          <strong>
            {formatThb(examinationFeeThb(draft.attemptedRank) || 0)}
          </strong>
          <small>
            This integer THB amount will be saved with the application.
          </small>
        </div>
        <dl>
          {Object.entries(reviewDraft)
            .filter(
              ([key]) =>
                key !== "promiseAccepted" && key !== "phoneCallingCode",
            )
            .map(([key, value]) => (
              <div key={key}>
                <dt>
                  {EXAM_REVIEW_LABELS[key as keyof ExamDraft] ||
                    key.replace(/([A-Z])/g, " $1")}
                </dt>
                <dd>{String(value) || "Not provided"}</dd>
              </div>
            ))}
        </dl>
        <TurnstileWidget onToken={onToken} resetSignal={reset} />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="btn-primary"
          disabled={busy || !token}
          onClick={() => void submit()}
        >
          {busy
            ? "Submitting…"
            : `Submit application · ${formatThb(examinationFeeThb(draft.attemptedRank) || 0)}`}
        </button>
      </div>
    );
  }
  return (
    <form className="student-long-form exam-application-form" onSubmit={review}>
      <header>
        <div>
          <p className="eyebrow">Step 1 of 2 · Aikido Association Thailand</p>
          <h2>Belt-examination application</h2>
          <p>
            Complete the applicant details below. Examination results and
            official notes are completed by administrators.
          </p>
        </div>
        <span className="admin-status is-neutral">
          Draft kept in this tab only
        </span>
      </header>
      <aside
        className="exam-requirement-key"
        aria-label="Question requirements"
      >
        <span>
          <b className="is-required">Required</b> Needed to submit
        </span>
        <span>
          <b className="is-optional">Optional</b> Add only when relevant
        </span>
      </aside>
      <fieldset>
        <ExamSectionLegend
          title="Verify your student record"
          copy="These details must match your active student profile."
        />
        <label>
          <ExamFieldCopy
            label="Student name in English"
            help="Use the English name shown on your official student profile."
          />
          <input
            name="verificationName"
            autoComplete="name"
            value={draft.verificationName}
            onChange={(event) => set("verificationName", event.target.value)}
            required
          />
        </label>
        <label>
          <ExamFieldCopy label="Student ID" help="Example: RSK-2601." />
          <input
            name="studentId"
            value={draft.studentId}
            onChange={(event) =>
              set("studentId", event.target.value.toUpperCase())
            }
            required
          />
        </label>
        <label>
          <ExamFieldCopy
            label="Current dojo"
            help="Choose the dojo shown on your student record."
          />
          <select
            name="dojoId"
            value={draft.dojoId}
            onChange={(event) => set("dojoId", event.target.value)}
            required
          >
            <option value="">Choose your dojo</option>
            {dojos.map((dojo) => (
              <option key={dojo.id} value={dojo.id}>
                {dojo.official_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <ExamFieldCopy
            label="Rank you are applying to test for"
            help={`Fee: ${formatThb(examinationFeeThb(draft.attemptedRank) || 0)}. Choose the next rank requested for this examination.`}
          />
          <select
            name="attemptedRank"
            value={draft.attemptedRank}
            onChange={(event) => set("attemptedRank", event.target.value)}
          >
            {EXAM_APPLICATION_RANKS.map((rank) => (
              <option key={rank}>{rank}</option>
            ))}
          </select>
        </label>
      </fieldset>
      <fieldset>
        <ExamSectionLegend
          title="Applicant details"
          copy="Personal details used for the association application."
        />
        <label>
          <ExamFieldCopy
            label="AAT membership number"
            optional
            help="Leave blank if you have not been assigned one."
          />
          <input
            name="aatNumber"
            value={draft.aatNumber}
            onChange={(event) => set("aatNumber", event.target.value)}
          />
        </label>
        <label>
          <ExamFieldCopy label="Given name" />
          <input
            name="firstName"
            autoComplete="given-name"
            value={draft.firstName}
            onChange={(event) => set("firstName", event.target.value)}
            required
          />
        </label>
        <label>
          <ExamFieldCopy label="Family name / surname" />
          <input
            name="surname"
            autoComplete="family-name"
            value={draft.surname}
            onChange={(event) => set("surname", event.target.value)}
            required
          />
        </label>
        <label>
          <ExamFieldCopy label="Nationality" />
          <input
            name="nationality"
            autoComplete="country-name"
            value={draft.nationality}
            onChange={(event) => set("nationality", event.target.value)}
            required
          />
        </label>
        <label>
          <ExamFieldCopy
            label="Sex / gender"
            help="Use the wording you want recorded on the association application."
          />
          <input
            name="sex"
            value={draft.sex}
            onChange={(event) => set("sex", event.target.value)}
            required
          />
        </label>
        <label>
          <ExamFieldCopy label="Date of birth" />
          <GregorianDateInput
            name="dateOfBirth"
            autoComplete="bday"
            value={draft.dateOfBirth}
            onChange={(value) => set("dateOfBirth", value)}
            required
          />
        </label>
      </fieldset>
      <fieldset>
        <ExamSectionLegend
          title="Address and contact"
          copy="How the association or dojo can identify and contact you."
        />
        <label>
          <ExamFieldCopy
            label="Permanent (registered) address"
            help="Include street, district, province or state, and country."
          />
          <textarea
            name="permanentAddress"
            autoComplete="street-address"
            value={draft.permanentAddress}
            onChange={(event) => set("permanentAddress", event.target.value)}
            required
          />
          <FreeTextPreference />
        </label>
        <label>
          <ExamFieldCopy
            label="Current address"
            optional
            help="Leave blank if it is the same as your permanent address."
          />
          <textarea
            name="presentAddress"
            value={draft.presentAddress}
            onChange={(event) => set("presentAddress", event.target.value)}
          />
          <FreeTextPreference />
        </label>
        <label>
          <ExamFieldCopy label="Country calling code" />
          <select
            name="phoneCountry"
            value={draft.phoneCountry}
            onChange={(event) => {
              const option = PHONE_COUNTRIES.find(
                ([country]) => country === event.target.value,
              );
              if (option)
                setDraft({
                  ...draft,
                  phoneCountry: option[0],
                  phoneCallingCode: option[1],
                });
            }}
          >
            {PHONE_COUNTRIES.map(([country, callingCode]) => (
              <option key={country} value={country}>
                {country} ({callingCode})
              </option>
            ))}
          </select>
        </label>
        <label>
          <ExamFieldCopy
            label="Telephone number"
            help="Enter a local number; the selected calling code is added automatically."
          />
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            pattern="[0-9 ()+.-]{6,24}"
            maxLength={24}
            placeholder="81 234 5678"
            value={draft.phone}
            onChange={(event) => set("phone", event.target.value)}
            required
          />
        </label>
      </fieldset>
      <fieldset className="exam-occupation-section">
        <ExamSectionLegend
          title="School or employment"
          copy="Choose what applies; only the useful follow-up questions will appear."
        />
        <div
          className="exam-occupation-options"
          role="radiogroup"
          aria-label="School or employment status"
        >
          {(
            Object.entries(OCCUPATION_LABELS).filter(
              ([value]) => value,
            ) as Array<[Exclude<ExamDraft["occupationType"], "">, string]>
          ).map(([value, label]) => (
            <label
              key={value}
              className={draft.occupationType === value ? "is-selected" : ""}
            >
              <input
                type="radio"
                name="occupationType"
                value={value}
                checked={draft.occupationType === value}
                onChange={() => setOccupation(value)}
                required
              />
              <span>
                <strong>{label}</strong>
                <small>
                  {value === "student"
                    ? "Add school details"
                    : value === "employed"
                      ? "Add workplace details"
                      : value === "both"
                        ? "Add both sets of details"
                        : "No follow-up fields"}
                </small>
              </span>
            </label>
          ))}
        </div>
        {draft.occupationType && draft.occupationType !== "not_applicable" ? (
          <div className="exam-occupation-fields">
            {draft.occupationType === "student" ||
            draft.occupationType === "both" ? (
              <>
                <label>
                  <ExamFieldCopy label="School or institution" />
                  <input
                    name="school"
                    value={draft.school}
                    onChange={(event) => set("school", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <ExamFieldCopy label="Class / year level" optional />
                  <input
                    name="classLevel"
                    value={draft.classLevel}
                    onChange={(event) => set("classLevel", event.target.value)}
                  />
                </label>
              </>
            ) : null}
            {draft.occupationType === "employed" ||
            draft.occupationType === "both" ? (
              <>
                <label>
                  <ExamFieldCopy label="Employer / office" />
                  <input
                    name="office"
                    autoComplete="organization"
                    value={draft.office}
                    onChange={(event) => set("office", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <ExamFieldCopy label="Position / job title" optional />
                  <input
                    name="position"
                    autoComplete="organization-title"
                    value={draft.position}
                    onChange={(event) => set("position", event.target.value)}
                  />
                </label>
              </>
            ) : null}
          </div>
        ) : null}
      </fieldset>
      <fieldset>
        <ExamSectionLegend
          title="Qualifications and experience"
          copy="A short summary helps the examiners understand your background."
        />
        <label>
          <ExamFieldCopy
            label="Relevant certificates or qualifications"
            optional
            help="Include aikido, martial arts, coaching, or related qualifications."
          />
          <textarea
            name="certificate"
            value={draft.certificate}
            onChange={(event) => set("certificate", event.target.value)}
          />
          <FreeTextPreference />
        </label>
        <label>
          <ExamFieldCopy
            label="Aikido, martial arts, or sports experience"
            optional
            help="If useful, briefly describe your training history, competitions, or relevant events."
          />
          <textarea
            name="gamesExperience"
            value={draft.gamesExperience}
            onChange={(event) => set("gamesExperience", event.target.value)}
          />
          <FreeTextPreference />
        </label>
      </fieldset>
      <fieldset>
        <ExamSectionLegend
          title="Declaration and signature"
          copy="Confirm the application is accurate before review."
        />
        <p>
          I promise to observe the rules of the Aikido Association Thailand and
          confirm that the information in this application is accurate.
        </p>
        <label>
          <ExamFieldCopy
            label="Applicant signature"
            help="Type your full legal name."
          />
          <input
            name="applicantSignature"
            autoComplete="name"
            value={draft.applicantSignature}
            onChange={(event) => set("applicantSignature", event.target.value)}
            required
          />
        </label>
        <label className="exam-promise">
          <input
            name="promiseAccepted"
            type="checkbox"
            checked={draft.promiseAccepted}
            onChange={(event) => set("promiseAccepted", event.target.checked)}
            required
          />
          <span>
            <strong>I accept the declaration above.</strong>
            <small>Required to submit this examination application.</small>
          </span>
        </label>
      </fieldset>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="btn-primary">Review every answer</button>
    </form>
  );
}

function AlertMark() {
  return (
    <div className="exam-alert-mark">
      <Clock3 />
    </div>
  );
}

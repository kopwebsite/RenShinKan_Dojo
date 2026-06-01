import { Banknote, CheckCircle, HandCoins, QrCode } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation, type TranslationKey } from "../i18n";
import { assetPath } from "../utils/assetPath";

/*
 * ============================================================================
 * RenshinKan Dojo — Monthly Contribution Form
 * ============================================================================
 * This is the warm, parent friendly contribution form shown on the Support
 * page. It has two stages:
 *
 *   1. The parent fills in their details, chooses how they would like to
 *      contribute, and agrees to the consent note.
 *   2. After they submit, they see a warm confirmation that matches the
 *      contribution method they picked.
 *
 * The payment choice is part of the form itself, so if you connect this to a
 * Google Form or Google Sheet you will be able to see exactly which method
 * each parent selected.
 *
 * Everything a site owner is likely to want to change lives in the clearly
 * labelled SETTINGS below, so you can edit the wording, the bank details, and
 * the QR code image without digging through the form logic.
 *
 * BACKEND CONNECTION:
 *   submitContribution() posts JSON to a Cloudflare Worker/Pages Function.
 *   The Worker owns the Google Form URL and entry IDs so they are never
 *   exposed in browser code.
 * ============================================================================
 */

/* ---------------------------------------------------------------------------
 * 1. EASY TO EDIT SETTINGS
 * ------------------------------------------------------------------------- */

// Cropped PromptPay QR asset used by the monthly contribution confirmation.
const PROMPTPAY_QR_IMAGE = "/images/promptpay-qr.png";

// Bank and PromptPay details shown when a parent chooses to transfer directly.
// Edit these to keep them current.
const BANK_DETAILS = {
  promptPayId: "0969380064", // same as the dojo mobile number
  accountNumber: "232-2-86409-7",
  bankName: "Kasikorn Bank",
};

// The contribution methods shown on the first page. The parent picks one.
// To turn the scheduled payment on later, set its "disabled" value to false.
const PAYMENT_METHODS = [
  {
    id: "inPerson",
    backendLabel: "Pay in person",
    labelKey: "support.contribution.methods.inPerson.label",
    noteKey: "support.contribution.methods.inPerson.note",
    disabled: false,
  },
  {
    id: "qr",
    backendLabel: "Pay with PromptPay QR code",
    labelKey: "support.contribution.methods.qr.label",
    noteKey: "support.contribution.methods.qr.note",
    disabled: false,
  },
  {
    id: "scheduled",
    backendLabel: "Set up scheduled payment",
    labelKey: "support.contribution.methods.scheduled.label",
    noteKey: "support.contribution.methods.scheduled.note",
    disabled: true, // greyed out for now
  },
] as const satisfies readonly {
  id: string;
  backendLabel: string;
  labelKey: TranslationKey;
  noteKey: TranslationKey;
  disabled: boolean;
}[];

type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];
const SUBMISSION_FAILED_ERROR = "CONTRIBUTION_SUBMIT_FAILED";

const MEMBERSHIP_WORKER_URL = (import.meta.env.VITE_MEMBERSHIP_WORKER_URL || "/api/membership").trim();
const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  theme?: "auto" | "light" | "dark";
  size?: "normal" | "compact" | "flexible";
};

type TurnstileApi = {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement | string, options: TurnstileOptions) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();

  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
      );

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Unable to load Cloudflare Turnstile.")), {
          once: true,
        });
        return;
      }

      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("Unable to load Cloudflare Turnstile.")), {
        once: true,
      });
      document.head.appendChild(script);
    });
  }

  return turnstileScriptPromise;
}

/* ---------------------------------------------------------------------------
 * 2. FORM DATA SHAPE
 * ------------------------------------------------------------------------- */

interface ContributionDetails {
  parentName: string; // required
  studentName: string; // required
  email: string; // required
  phone: string; // required
  address: string; // required
  paymentMethod: PaymentMethodId | ""; // required
  notes: string; // optional
  consent: boolean; // required
}

const emptyDetails: ContributionDetails = {
  parentName: "",
  studentName: "",
  email: "",
  phone: "",
  address: "",
  paymentMethod: "",
  notes: "",
  consent: false,
};

type FieldErrors = Partial<Record<keyof ContributionDetails | "turnstile", string>>;

/* ---------------------------------------------------------------------------
 * 3. BACKEND SUBMISSION
 * ------------------------------------------------------------------------- */

/**
 * Called when the parent submits the form.
 *
 * The submitted details include `paymentMethod`, so whichever backend you use
 * will know which contribution method the parent chose. Right now it simply
 * logs the details so you can see them in the browser console. Replace the body
 * with whichever backend you prefer:
 *
 *   • GOOGLE FORM
 *     Map each field (including paymentMethod) to a Google Form entry id and
 *     POST to the form's formResponse URL, or redirect to a pre-filled form.
 *
 *   • GOOGLE SHEET
 *     Create a Google Apps Script web app bound to your sheet, publish it,
 *     and POST the details to its URL:
 *       await fetch("https://script.google.com/.../exec", {
 *         method: "POST",
 *         body: JSON.stringify(details),
 *       });
 *
 *   • EMAIL NOTIFICATION
 *     POST the details to a small serverless function (for example a
 *     Cloudflare Pages Function in /functions) that sends an email through
 *     Brevo, Resend, or your provider of choice.
 *
 *   • ANOTHER BACKEND
 *     Any endpoint that accepts JSON will work. Return a resolved promise on
 *     success so the confirmation screen can appear.
 */
async function submitContribution(details: ContributionDetails, turnstileToken: string): Promise<void> {
  const response = await fetch(MEMBERSHIP_WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parentName: details.parentName.trim(),
      studentName: details.studentName.trim(),
      emailAddress: details.email.trim(),
      phoneNumber: details.phone.trim(),
      homeAddress: details.address.trim(),
      paymentMethod: getPaymentMethodLabel(details.paymentMethod),
      notes: details.notes.trim(),
      agreement: "Check",
      turnstileToken,
    }),
  });

  const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;

  if (!response.ok || !result?.success) {
    throw new Error(result?.error || SUBMISSION_FAILED_ERROR);
  }
}

function getPaymentMethodLabel(paymentMethod: PaymentMethodId | "") {
  return PAYMENT_METHODS.find((method) => method.id === paymentMethod)?.backendLabel ?? paymentMethod;
}

/* ---------------------------------------------------------------------------
 * 4. THE FORM COMPONENT
 * ------------------------------------------------------------------------- */

export function ContributionForm() {
  const { t } = useTranslation();
  const [details, setDetails] = useState<ContributionDetails>(emptyDetails);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedDetails, setSubmittedDetails] = useState<ContributionDetails | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Update a single field and clear any error already showing for it.
  function updateField<K extends keyof ContributionDetails>(field: K, value: ContributionDetails[K]) {
    setDetails((current) => ({ ...current, [field]: value }));
    setSubmitError("");
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  // Check the required fields and return any problems we find.
  function validate(values: ContributionDetails, verificationToken: string): FieldErrors {
    const found: FieldErrors = {};
    if (!values.parentName.trim()) found.parentName = t("support.contribution.errors.parentName");
    if (!values.studentName.trim()) found.studentName = t("support.contribution.errors.studentName");
    if (!values.email.trim()) {
      found.email = t("support.contribution.errors.email");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      found.email = t("support.contribution.errors.emailInvalid");
    }
    if (!values.phone.trim()) found.phone = t("support.contribution.errors.phone");
    if (!values.address.trim()) found.address = t("support.contribution.errors.address");
    if (!values.paymentMethod) found.paymentMethod = t("support.contribution.errors.paymentMethod");
    if (!values.consent) found.consent = t("support.contribution.errors.consent");
    if (!TURNSTILE_SITE_KEY) {
      found.turnstile = t("support.contribution.errors.turnstileMissing");
    } else if (!verificationToken) {
      found.turnstile = t("support.contribution.errors.turnstileRequired");
    }
    return found;
  }

  const clearTurnstileError = useCallback(() => {
    setErrors((current) => {
      if (!current.turnstile) return current;
      const next = { ...current };
      delete next.turnstile;
      return next;
    });
  }, []);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setSubmitError("");
    clearTurnstileError();
  }, [clearTurnstileError]);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
    setErrors((current) => ({
      ...current,
      turnstile: t("support.contribution.errors.turnstileExpired"),
    }));
  }, [t]);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken("");
    setErrors((current) => ({
      ...current,
      turnstile: t("support.contribution.errors.turnstileLoad"),
    }));
  }, [t]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    const found = validate(details, turnstileToken);
    setErrors(found);

    if (Object.keys(found).length > 0) {
      // Move focus to the first field that needs attention.
      const firstError = Object.keys(found)[0];
      const selector = firstError === "turnstile" ? "[data-turnstile-block]" : `[name="${firstError}"]`;
      const element = formRef.current?.querySelector<HTMLElement>(selector);
      element?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await submitContribution(details, turnstileToken);
      setSubmittedDetails(details);
      setDetails(emptyDetails);
      setTurnstileToken("");
      setSubmitted(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message !== SUBMISSION_FAILED_ERROR
          ? error.message
          : t("support.contribution.errors.submitFailed"),
      );
      setTurnstileToken("");
      setTurnstileResetSignal((signal) => signal + 1);
    } finally {
      setSubmitting(false);
    }
  }

  const confirmationDetails = submittedDetails ?? details;

  return (
    <article className="surface rounded-[2rem] p-6 sm:p-8 lg:p-10">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bamboo/15 text-bamboo">
        <HandCoins size={26} aria-hidden="true" />
      </div>

      {/* ---- STAGE 1: the parent details form ---- */}
      {!submitted && (
        <>
          <h3 className="mt-5 text-3xl text-ink">{t("support.contribution.title")}</h3>
          <p className="mt-4 text-sm leading-6 text-charcoal/75">
            {t("support.contribution.copy")}
          </p>

          <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-7 grid gap-5">
            <Field label={t("support.contribution.fields.parentName")} htmlFor="parentName" required error={errors.parentName}>
              <input
                id="parentName"
                name="parentName"
                type="text"
                required
                autoComplete="name"
                aria-invalid={Boolean(errors.parentName)}
                className="input-field"
                value={details.parentName}
                onChange={(event) => updateField("parentName", event.target.value)}
              />
            </Field>

            <Field label={t("support.contribution.fields.studentName")} htmlFor="studentName" required error={errors.studentName}>
              <input
                id="studentName"
                name="studentName"
                type="text"
                required
                aria-invalid={Boolean(errors.studentName)}
                className="input-field"
                value={details.studentName}
                onChange={(event) => updateField("studentName", event.target.value)}
              />
            </Field>

            <Field label={t("support.contribution.fields.email")} htmlFor="email" required error={errors.email}>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                className="input-field"
                value={details.email}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </Field>

            <Field label={t("support.contribution.fields.phone")} htmlFor="phone" required error={errors.phone}>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                autoComplete="tel"
                inputMode="tel"
                aria-invalid={Boolean(errors.phone)}
                className="input-field"
                value={details.phone}
                onChange={(event) => updateField("phone", event.target.value)}
              />
            </Field>

            <Field label={t("support.contribution.fields.address")} htmlFor="address" required error={errors.address}>
              <textarea
                id="address"
                name="address"
                rows={2}
                required
                autoComplete="street-address"
                aria-invalid={Boolean(errors.address)}
                className="input-field"
                value={details.address}
                onChange={(event) => updateField("address", event.target.value)}
              />
            </Field>

            {/* Payment method choice. This is captured with the form so a
                Google Form or Google Sheet can record which method was chosen. */}
            <fieldset>
              <legend className="flex items-center gap-2 text-sm font-semibold text-ink">
                {t("support.contribution.paymentLegend")}
                <span className="text-vermilion" aria-hidden="true">
                  *
                </span>
              </legend>
              <div className="mt-2 grid gap-3">
                {PAYMENT_METHODS.map((method) => {
                  const checked = details.paymentMethod === method.id;
                  return (
                    <label
                      key={method.id}
                      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                        method.disabled
                          ? "cursor-not-allowed border-ink/10 bg-ink/5 opacity-55"
                          : checked
                            ? "cursor-pointer border-vermilion bg-vermilion/5"
                            : "cursor-pointer border-ink/15 bg-paper/60 hover:border-vermilion/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method.id}
                        disabled={method.disabled}
                        checked={checked}
                        aria-invalid={Boolean(errors.paymentMethod)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-vermilion"
                        onChange={() => updateField("paymentMethod", method.id)}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-ink">
                          {t(method.labelKey)}
                          {method.disabled && (
                            <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-charcoal/60">
                              {t("support.contribution.comingSoon")}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-charcoal/65">
                          {t(method.noteKey)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.paymentMethod && (
                <p className="mt-1.5 text-xs font-semibold text-vermilion">{errors.paymentMethod}</p>
              )}
            </fieldset>

            <Field
              label={t("support.contribution.fields.notes")}
              htmlFor="notes"
              hint={t("support.contribution.optional")}
            >
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder={t("support.contribution.notesPlaceholder")}
                className="input-field"
                value={details.notes}
                onChange={(event) => updateField("notes", event.target.value)}
              />
            </Field>

            {/* Consent checkbox (required) */}
            <div>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/15 bg-paper/60 px-4 py-3">
                <input
                  name="consent"
                  type="checkbox"
                  required
                  aria-invalid={Boolean(errors.consent)}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-vermilion"
                  checked={details.consent}
                  onChange={(event) => updateField("consent", event.target.checked)}
                />
                <span className="text-sm leading-6 text-charcoal/80">{t("support.contribution.consent")}</span>
              </label>
              {errors.consent && (
                <p className="mt-1.5 text-xs font-semibold text-vermilion">{errors.consent}</p>
              )}
            </div>

            <TurnstileWidget
              siteKey={TURNSTILE_SITE_KEY}
              error={errors.turnstile}
              resetSignal={turnstileResetSignal}
              onVerify={handleTurnstileVerify}
              onExpire={handleTurnstileExpire}
              onError={handleTurnstileError}
            />

            {submitError && (
              <p className="rounded-2xl border border-vermilion/25 bg-vermilion/5 px-4 py-3 text-sm font-semibold text-vermilion">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={submitting || !TURNSTILE_SITE_KEY}
            >
              <CheckCircle size={18} aria-hidden="true" />
              {submitting ? t("support.contribution.submitting") : t("support.contribution.submit")}
            </button>
          </form>
        </>
      )}

      {/* ---- STAGE 2: the confirmation that matches the chosen method ---- */}
      {submitted && (
        <div className="mt-5">
          {/* PAY IN PERSON confirmation */}
          {confirmationDetails.paymentMethod === "inPerson" && (
            <>
              <h3 className="text-3xl text-ink">{t("support.contribution.confirm.title")}</h3>
              <ConfirmationNote>{t("support.contribution.confirm.inPerson")}</ConfirmationNote>
            </>
          )}

          {/* PAY WITH QR CODE confirmation, with the direct bank transfer option */}
          {confirmationDetails.paymentMethod === "qr" && (
            <>
              <h3 className="text-3xl text-ink">{t("support.contribution.confirm.title")}</h3>
              <ConfirmationNote>{t("support.contribution.confirm.qr")}</ConfirmationNote>

              <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
                {/* QR code. */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-vermilion">
                    <QrCode size={18} aria-hidden="true" />
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                      {t("support.contribution.qrTitle")}
                    </span>
                  </div>
                  <img
                    src={assetPath(PROMPTPAY_QR_IMAGE)}
                    alt={t("support.contribution.qrAlt")}
                    className="aspect-square w-56 max-w-full rounded-2xl border border-ink/10 bg-paper object-contain p-2"
                    width={224}
                    height={224}
                  />
                </div>

                {/* Another option: transfer directly to the dojo bank account. */}
                <div className="rounded-2xl border border-ink/10 bg-paper/50 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-vermilion/10 text-vermilion">
                      <Banknote size={22} aria-hidden="true" />
                    </div>
                    <h4 className="text-xl text-ink">{t("support.contribution.bankTitle")}</h4>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-charcoal/75">
                    {t("support.contribution.bankCopy")}
                  </p>
                  <dl className="mt-4 grid gap-3">
                    <BankRow label={t("support.transfer.promptPayId")} value={BANK_DETAILS.promptPayId} />
                    <BankRow label={t("support.transfer.accountNumber")} value={BANK_DETAILS.accountNumber} />
                    <BankRow label={t("support.transfer.bank")} value={BANK_DETAILS.bankName} />
                  </dl>
                </div>
              </div>
            </>
          )}

          {/* Safety net: if somehow no method was set, show a gentle thank you. */}
          {confirmationDetails.paymentMethod !== "inPerson" && confirmationDetails.paymentMethod !== "qr" && (
            <>
              <h3 className="text-3xl text-ink">{t("support.contribution.confirm.fallbackTitle")}</h3>
              <ConfirmationNote>{t("support.contribution.confirm.fallback")}</ConfirmationNote>
            </>
          )}
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------------------
 * 5. SMALL PRESENTATION HELPERS
 * ------------------------------------------------------------------------- */

function TurnstileWidget({
  siteKey,
  error,
  resetSignal,
  onVerify,
  onExpire,
  onError,
}: {
  siteKey: string;
  error?: string;
  resetSignal: number;
  onVerify: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let mounted = true;

    loadTurnstileScript()
      .then(() => {
        window.turnstile?.ready(() => {
          if (!mounted || !containerRef.current || widgetIdRef.current) return;

          widgetIdRef.current = window.turnstile?.render(containerRef.current, {
            sitekey: siteKey,
            theme: "light",
            size: "flexible",
            callback: onVerify,
            "expired-callback": onExpire,
            "error-callback": onError,
          }) ?? null;
        });
      })
      .catch(() => {
        if (mounted) onError();
      });

    return () => {
      mounted = false;

      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, onVerify, onExpire, onError]);

  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current) {
      window.turnstile?.reset(widgetIdRef.current);
    }
  }, [resetSignal]);

  if (!siteKey) {
    return (
      <div
        data-turnstile-block
        tabIndex={-1}
        className="rounded-2xl border border-vermilion/20 bg-vermilion/5 px-4 py-3 outline-none"
      >
        <p className="text-sm font-semibold text-vermilion">{t("support.contribution.turnstile.missingTitle")}</p>
        <p className="mt-1 text-xs leading-5 text-charcoal/65">
          {t("support.contribution.turnstile.missingCopy")}
        </p>
      </div>
    );
  }

  return (
    <div
      data-turnstile-block
      tabIndex={-1}
      className="rounded-2xl border border-ink/15 bg-paper/60 px-4 py-4 outline-none"
    >
      <p className="mb-3 text-sm font-semibold text-ink">{t("support.contribution.turnstile.title")}</p>
      <div ref={containerRef} />
      {error && <p className="mt-2 text-xs font-semibold text-vermilion">{error}</p>}
    </div>
  );
}

// A labelled form field with an optional hint and an error message.
function Field({
  label,
  htmlFor,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-sm font-semibold text-ink">
        {label}
        {required ? (
          <span className="text-vermilion" aria-hidden="true">
            *
          </span>
        ) : (
          hint && <span className="text-xs font-normal text-charcoal/50">{hint}</span>
        )}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs font-semibold text-vermilion">{error}</p>}
    </div>
  );
}

// One row of bank or PromptPay detail.
function BankRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-charcoal/50">{label}</dt>
      <dd className="text-base font-bold text-ink">{value}</dd>
    </div>
  );
}

// The warm confirmation message shown after submitting.
function ConfirmationNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl bg-bamboo/10 px-4 py-3 ring-1 ring-bamboo/20">
      <CheckCircle size={18} className="mt-0.5 shrink-0 text-bamboo" aria-hidden="true" />
      <p className="text-sm leading-6 text-charcoal/80">{children}</p>
    </div>
  );
}

import { Banknote, CheckCircle, HandCoins, QrCode } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation, type TranslationKey } from "../i18n";
import { assetPath } from "../utils/assetPath";

/*
 * ============================================================================
 * RenShinKan Dojo — Monthly Contribution Form
 * ============================================================================
 * This is the warm, parent friendly contribution form shown on the Support
 * page. It has two stages:
 *
 *   1. The parent fills in their details, chooses how they would like to
 *      contribute, and agrees to the consent note.
 *   2. After they submit, they either see a warm confirmation that matches
 *      the contribution method they picked or, for scheduled payments, they
 *      continue to Stripe.
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

// Creates the recurring monthly dojo dues subscription through Stripe after the support form is submitted.
const STRIPE_MONTHLY_DUES_PAYMENT_LINK = "https://buy.stripe.com/4gM4gzawbfAZ59U2K45kk00";

// Bank and PromptPay details shown when a parent chooses to transfer directly.
// Edit these to keep them current.
const BANK_DETAILS = {
  promptPayId: "0969380064", // same as the dojo mobile number
  accountNumber: "232-2-86409-7",
  bankName: "Kasikorn Bank",
};

// The contribution methods shown on the first page. The parent picks one.
const PAYMENT_METHODS = [
  {
    id: "qr",
    backendLabel: "Pay with PromptPay QR code",
    labelKey: "support.contribution.methods.qr.label",
    noteKey: "support.contribution.methods.qr.note",
    disabled: false,
    preferred: false,
  },
  {
    id: "scheduled",
    backendLabel: "Scheduled payment via Stripe",
    labelKey: "support.contribution.methods.scheduled.label",
    noteKey: "support.contribution.methods.scheduled.note",
    disabled: false,
    preferred: true,
  },
] as const satisfies readonly {
  id: string;
  backendLabel: string;
  labelKey: TranslationKey;
  noteKey: TranslationKey;
  disabled: boolean;
  preferred?: boolean;
}[];

type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];
const SCHEDULED_PAYMENT_METHOD_ID = "scheduled" satisfies PaymentMethodId;
const SUBMISSION_FAILED_ERROR = "CONTRIBUTION_SUBMIT_FAILED";

const MEMBERSHIP_WORKER_URL = (import.meta.env.VITE_MEMBERSHIP_WORKER_URL || "/api/membership").trim();
const LOCAL_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
const CONFIGURED_TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
const TURNSTILE_SITE_KEY = resolveTurnstileSiteKey(CONFIGURED_TURNSTILE_SITE_KEY);
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_SCRIPT_SELECTOR = 'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]';

type TurnstileOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": (errorCode?: string) => void;
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

let turnstileScriptPromise: Promise<TurnstileApi> | null = null;

function resolveTurnstileSiteKey(configuredSiteKey: string) {
  if (!configuredSiteKey || configuredSiteKey.includes("PLACEHOLDER")) {
    return isLocalTurnstileHost() ? LOCAL_TURNSTILE_SITE_KEY : "";
  }

  return configuredSiteKey;
}

function isLocalTurnstileHost() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(window.location.hostname);
}

function loadTurnstileScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cloudflare Turnstile requires a browser."));
  }

  if (window.turnstile) return Promise.resolve(window.turnstile);

  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      let settled = false;

      const timeoutId = window.setTimeout(() => {
        fail(new Error("Cloudflare Turnstile did not become ready."));
      }, 15_000);

      function fail(error: Error) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        reject(error);
      }

      function resolveWhenAvailable() {
        const startedAt = window.performance.now();

        function checkApi() {
          if (settled) return;

          if (window.turnstile) {
            settled = true;
            window.clearTimeout(timeoutId);
            resolve(window.turnstile);
            return;
          }

          if (window.performance.now() - startedAt > 3_000) {
            fail(new Error("Cloudflare Turnstile API was not available after load."));
            return;
          }

          window.setTimeout(checkApi, 50);
        }

        checkApi();
      }

      document.querySelector<HTMLScriptElement>(TURNSTILE_SCRIPT_SELECTOR)?.remove();

      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.addEventListener("load", resolveWhenAvailable, { once: true });
      script.addEventListener("error", () => {
        fail(new Error("Unable to load Cloudflare Turnstile."));
      }, {
        once: true,
      });
      document.head.appendChild(script);
    }).catch((error) => {
      turnstileScriptPromise = null;
      throw error;
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
 * will know which contribution method the parent chose. The current production
 * path posts the verified submission to the configured membership worker.
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
  const submittingRef = useRef(false);

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

    if (submittingRef.current) {
      return;
    }

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

    const submittedContributionDetails = details;
    const isScheduledPayment = submittedContributionDetails.paymentMethod === SCHEDULED_PAYMENT_METHOD_ID;
    let redirectingToStripe = false;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await submitContribution(submittedContributionDetails, turnstileToken);

      if (isScheduledPayment) {
        redirectingToStripe = true;
        window.location.href = STRIPE_MONTHLY_DUES_PAYMENT_LINK;
        return;
      }

      setSubmittedDetails(submittedContributionDetails);
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
      if (!redirectingToStripe) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }

  const confirmationDetails = submittedDetails ?? details;

  return (
    <article className="surface rounded-[2rem] p-4 min-[380px]:p-6 sm:p-8 lg:p-10">
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

          <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-7 grid min-w-0 gap-5">
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
                          {method.preferred && (
                            <span className="ml-2 rounded-full bg-bamboo/15 px-2 py-0.5 text-[0.65rem] font-bold text-bamboo">
                              {t("support.contribution.preferred")}
                            </span>
                          )}
                          {method.disabled && (
                            <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-charcoal/60">
                              {t("support.contribution.comingSoon")}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-charcoal/65">
                          {renderRichText(t(method.noteKey))}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.paymentMethod && (
                <p role="alert" className="mt-1.5 text-xs font-semibold text-vermilion">{errors.paymentMethod}</p>
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
                <p role="alert" className="mt-1.5 text-xs font-semibold text-vermilion">{errors.consent}</p>
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
              <p role="alert" className="rounded-2xl border border-vermilion/25 bg-vermilion/5 px-4 py-3 text-sm font-semibold text-vermilion">
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
          {/* PAY WITH QR CODE confirmation, with the direct bank transfer option */}
          {confirmationDetails.paymentMethod === "qr" && (
            <>
              <h3 className="text-3xl text-ink">{t("support.contribution.confirm.title")}</h3>
              <ConfirmationNote text={t("support.contribution.confirm.qr")} />

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
                    loading="lazy"
                    decoding="async"
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
          {confirmationDetails.paymentMethod !== "qr" && (
            <>
              <h3 className="text-3xl text-ink">{t("support.contribution.confirm.fallbackTitle")}</h3>
              <ConfirmationNote text={t("support.contribution.confirm.fallback")} />
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
  onError: (errorCode?: string) => void;
}) {
  const { t } = useTranslation();
  const blockRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const requestLoad = useCallback(() => {
    if (siteKey) {
      setShouldLoad(true);
    }
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || shouldLoad || !blockRef.current) return;

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "420px 0px" },
    );

    observer.observe(blockRef.current);

    return () => observer.disconnect();
  }, [siteKey, shouldLoad]);

  useEffect(() => {
    const container = containerRef.current;

    if (!siteKey || !shouldLoad || !container) return;

    let mounted = true;
    setLoadState("loading");

    loadTurnstileScript()
      .then((turnstile) => {
        if (!mounted || widgetIdRef.current) return;

        try {
          widgetIdRef.current = turnstile.render(container, {
            sitekey: siteKey,
            theme: "light",
            size: "flexible",
            callback: onVerify,
            "expired-callback": onExpire,
            "error-callback": onError,
          }) ?? null;
          setLoadState("ready");
        } catch {
          setLoadState("error");
          onError();
        }
      })
      .catch(() => {
        if (mounted) {
          setLoadState("error");
          onError();
        }
      });

    return () => {
      mounted = false;

      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, shouldLoad, onVerify, onExpire, onError]);

  useEffect(() => {
    if (resetSignal <= 0) return;

    if (widgetIdRef.current) {
      window.turnstile?.reset(widgetIdRef.current);
      return;
    }

    setShouldLoad(true);
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
      ref={blockRef}
      data-turnstile-block
      tabIndex={-1}
      className="min-w-0 overflow-hidden rounded-2xl border border-ink/15 bg-paper/60 px-2 py-4 outline-none min-[380px]:px-4"
      aria-busy={loadState === "loading"}
      onFocus={requestLoad}
      onPointerEnter={requestLoad}
    >
      <p className="mb-3 text-sm font-semibold text-ink">{t("support.contribution.turnstile.title")}</p>
      <div className="min-h-[82px]">
        <div ref={containerRef} className="max-w-full" />
        {loadState !== "ready" && (
          <div className="grid min-h-[82px] place-items-center rounded-xl border border-dashed border-ink/15 bg-paper/45 px-4 text-center">
            <div>
              <div className="mx-auto mb-2 h-7 w-7 animate-pulse rounded-full border border-bamboo/30 bg-bamboo/10" />
              <p className="text-xs font-semibold text-charcoal/65">
                {loadState === "error"
                  ? t("support.contribution.errors.turnstileLoad")
                  : loadState === "loading"
                    ? t("support.contribution.turnstile.loading")
                    : t("support.contribution.turnstile.idle")}
              </p>
              {loadState === "error" && (
                <button
                  type="button"
                  className="mt-3 text-xs font-bold text-vermilion underline-offset-4 hover:underline"
                  onClick={() => {
                    setLoadState("idle");
                    setShouldLoad(false);
                    window.requestAnimationFrame(() => setShouldLoad(true));
                  }}
                >
                  {t("support.contribution.turnstile.retry")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {error && loadState !== "error" && (
        <p role="alert" className="mt-2 text-xs font-semibold text-vermilion">{error}</p>
      )}
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
      {error && <p role="alert" className="mt-1.5 text-xs font-semibold text-vermilion">{error}</p>}
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

// Renders **bold** markers from a translation string as <strong> while leaving
// everything else as plain text. Strings without markers (for example the other
// language translations) simply render unchanged.
function renderRichText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((segment, index) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(segment);
    return bold ? (
      <strong key={index} className="font-semibold text-ink">
        {bold[1]}
      </strong>
    ) : (
      segment
    );
  });
}

// The warm confirmation message shown after submitting. A blank line in the
// translation string (\n\n) splits the message into separate paragraphs, and
// **bold** markers are emphasised.
function ConfirmationNote({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl bg-bamboo/10 px-4 py-3 ring-1 ring-bamboo/20">
      <CheckCircle size={18} className="mt-0.5 shrink-0 text-bamboo" aria-hidden="true" />
      <div className="space-y-3">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="text-sm leading-6 text-charcoal/80">
            {renderRichText(paragraph)}
          </p>
        ))}
      </div>
    </div>
  );
}

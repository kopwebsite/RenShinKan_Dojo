import { Banknote, CheckCircle, HandCoins, QrCode } from "lucide-react";
import { useRef, useState } from "react";
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
 * WHERE TO CONNECT A BACKEND:
 *   See the submitContribution() and notifySensei() functions further down.
 *   Both are placeholders with comments showing exactly where to plug in a
 *   Google Form, a Google Sheet, an email notification, or any simple backend.
 * ============================================================================
 */

/* ---------------------------------------------------------------------------
 * 1. EASY TO EDIT SETTINGS
 * ------------------------------------------------------------------------- */

// Replace this with the real PromptPay QR image once you have it.
// Drop the file into the public/images folder and update the path here.
const PROMPTPAY_QR_IMAGE = "/images/promptpay-qr.png";

// Bank and PromptPay details shown when a parent chooses to transfer directly.
// Edit these to keep them current.
const BANK_DETAILS = {
  promptPayId: "0969380064", // same as the dojo mobile number
  accountNumber: "232-2-86409-7",
  bankName: "Kasikorn Bank",
};

// The consent the parent must agree to before they can submit.
const CONSENT_TEXT =
  "I understand that monthly contributions are due on the 1st of every month to help ensure the dojo can operate smoothly.";

// A gentle reminder reused in the confirmation messages.
const DUE_REMINDER =
  "Monthly contributions are due on the 1st of every month to help ensure the dojo can operate smoothly.";

// The contribution methods shown on the first page. The parent picks one.
// To turn the scheduled payment on later, set its "disabled" value to false.
const PAYMENT_METHODS = [
  {
    id: "inPerson",
    label: "Pay in person",
    note: "Hand your monthly contribution to Sensei at the dojo.",
    disabled: false,
  },
  {
    id: "qr",
    label: "Pay with PromptPay QR code",
    note: "Scan and pay from your banking app, or transfer directly to the dojo bank account.",
    disabled: false,
  },
  {
    id: "scheduled",
    label: "Set up scheduled payment",
    note: "This option is not ready yet. We are still setting it up.",
    disabled: true, // greyed out for now
  },
] as const;

type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

/* ---------------------------------------------------------------------------
 * 2. FORM DATA SHAPE
 * ------------------------------------------------------------------------- */

interface ContributionDetails {
  parentName: string; // optional
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

type FieldErrors = Partial<Record<keyof ContributionDetails, string>>;

/* ---------------------------------------------------------------------------
 * 3. BACKEND PLACEHOLDERS  (this is where you connect things later)
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
async function submitContribution(details: ContributionDetails): Promise<void> {
  // TODO: replace this console log with a real submission (see notes above).
  console.log("New monthly contribution request:", details);
  return Promise.resolve();
}

/**
 * Called when the parent chooses "Pay in person".
 *
 * This is where you can let Sensei know to expect the contribution. For
 * example, POST to a Cloudflare Pages Function that sends an email or a
 * Facebook message. For now it just logs to the console.
 */
async function notifySensei(details: ContributionDetails): Promise<void> {
  // TODO: add Sensei notification logic here (email, message, etc.).
  console.log("Sensei notification (pay in person):", details.studentName, details.email);
  return Promise.resolve();
}

/* ---------------------------------------------------------------------------
 * 4. THE FORM COMPONENT
 * ------------------------------------------------------------------------- */

export function ContributionForm() {
  const [details, setDetails] = useState<ContributionDetails>(emptyDetails);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Update a single field and clear any error already showing for it.
  function updateField<K extends keyof ContributionDetails>(field: K, value: ContributionDetails[K]) {
    setDetails((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  // Check the required fields and return any problems we find.
  function validate(values: ContributionDetails): FieldErrors {
    const found: FieldErrors = {};
    if (!values.studentName.trim()) found.studentName = "Please add the student name.";
    if (!values.email.trim()) {
      found.email = "Please add an email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      found.email = "Please check this email address.";
    }
    if (!values.phone.trim()) found.phone = "Please add a phone number.";
    if (!values.address.trim()) found.address = "Please add your home address.";
    if (!values.paymentMethod) found.paymentMethod = "Please choose how you would like to contribute.";
    if (!values.consent) found.consent = "Please tick the box to continue.";
    return found;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate(details);
    setErrors(found);

    if (Object.keys(found).length > 0) {
      // Move focus to the first field that needs attention.
      const firstError = Object.keys(found)[0];
      const element = formRef.current?.querySelector<HTMLElement>(`[name="${firstError}"]`);
      element?.focus();
      return;
    }

    await submitContribution(details);

    // If they are paying in person, let Sensei know to expect them.
    if (details.paymentMethod === "inPerson") {
      await notifySensei(details);
    }

    setSubmitted(true);
  }

  return (
    <article className="surface rounded-[2rem] p-6 sm:p-8 lg:p-10">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bamboo/15 text-bamboo">
        <HandCoins size={26} aria-hidden="true" />
      </div>

      {/* ---- STAGE 1: the parent details form ---- */}
      {!submitted && (
        <>
          <h3 className="mt-5 text-3xl text-ink">Arrange your monthly contribution</h3>
          <p className="mt-4 text-sm leading-6 text-charcoal/75">
            Please share a few details and choose how you would like to contribute. Only a few fields are
            needed. Everything else is there if you wish to add it.
          </p>

          <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-7 grid gap-5">
            <Field label="Parent or guardian name" htmlFor="parentName" hint="Optional">
              <input
                id="parentName"
                name="parentName"
                type="text"
                autoComplete="name"
                className="input-field"
                value={details.parentName}
                onChange={(event) => updateField("parentName", event.target.value)}
              />
            </Field>

            <Field label="Student name" htmlFor="studentName" required error={errors.studentName}>
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

            <Field label="Email address" htmlFor="email" required error={errors.email}>
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

            <Field label="Phone number" htmlFor="phone" required error={errors.phone}>
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

            <Field label="Home address" htmlFor="address" required error={errors.address}>
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
                How would you like to contribute?
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
                          {method.label}
                          {method.disabled && (
                            <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-charcoal/60">
                              Coming soon
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-charcoal/65">{method.note}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.paymentMethod && (
                <p className="mt-1.5 text-xs font-semibold text-vermilion">{errors.paymentMethod}</p>
              )}
            </fieldset>

            <Field label="Notes for Sensei" htmlFor="notes" hint="Optional">
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Anything you would like Sensei to know."
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
                <span className="text-sm leading-6 text-charcoal/80">{CONSENT_TEXT}</span>
              </label>
              {errors.consent && (
                <p className="mt-1.5 text-xs font-semibold text-vermilion">{errors.consent}</p>
              )}
            </div>

            <button type="submit" className="btn-primary mt-1 w-full sm:w-auto">
              <CheckCircle size={18} aria-hidden="true" />
              Submit my contribution details
            </button>
          </form>
        </>
      )}

      {/* ---- STAGE 2: the confirmation that matches the chosen method ---- */}
      {submitted && (
        <div className="mt-5">
          {/* PAY IN PERSON confirmation */}
          {details.paymentMethod === "inPerson" && (
            <>
              <h3 className="text-3xl text-ink">Thank you</h3>
              <ConfirmationNote>
                Thank you. Sensei has been notified and will be expecting your monthly contribution in
                person. {DUE_REMINDER}
              </ConfirmationNote>
            </>
          )}

          {/* PAY WITH QR CODE confirmation, with the direct bank transfer option */}
          {details.paymentMethod === "qr" && (
            <>
              <h3 className="text-3xl text-ink">Thank you</h3>
              <ConfirmationNote>
                Thank you. Here is the PromptPay QR code. We appreciate your contribution and your care for
                the dojo. {DUE_REMINDER}
              </ConfirmationNote>

              <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
                {/* QR code. Replace PROMPTPAY_QR_IMAGE at the top of this file
                    with the real QR image when you have it. */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-vermilion">
                    <QrCode size={18} aria-hidden="true" />
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                      PromptPay QR code
                    </span>
                  </div>
                  <img
                    src={assetPath(PROMPTPAY_QR_IMAGE)}
                    alt="PromptPay QR code for RenshinKan Dojo"
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
                    <h4 className="text-xl text-ink">Transfer directly to bank</h4>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-charcoal/75">
                    You are also welcome to transfer your contribution straight to the dojo account.
                  </p>
                  <dl className="mt-4 grid gap-3">
                    <BankRow label="PromptPay ID (same as mobile)" value={BANK_DETAILS.promptPayId} />
                    <BankRow label="Account number" value={BANK_DETAILS.accountNumber} />
                    <BankRow label="Bank" value={BANK_DETAILS.bankName} />
                  </dl>
                </div>
              </div>
            </>
          )}

          {/* Safety net: if somehow no method was set, show a gentle thank you. */}
          {details.paymentMethod !== "inPerson" && details.paymentMethod !== "qr" && (
            <>
              <h3 className="text-3xl text-ink">Thank you</h3>
              <ConfirmationNote>Thank you for supporting RenshinKan Dojo. {DUE_REMINDER}</ConfirmationNote>
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

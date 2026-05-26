import { CheckCircle, ChevronDown, CreditCard, Heart, QrCode, Repeat2, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { MotionSection } from "../components/MotionSection";

const dojoExpenses = [
  { label: "Electricity & Water",        note: "Monthly utility bills for the training hall, changing rooms, and grounds." },
  { label: "Mat Cleaning & Upkeep",      note: "Regular cleaning supplies, sanitising, and tatami maintenance." },
  { label: "Building Maintenance",       note: "Ongoing repairs, painting, and general upkeep of the dojo structure and garden." },
  { label: "Training Equipment",         note: "Replacement and maintenance of bokken, jo, tanto, and other practice gear." },
  { label: "Event & Seminar Costs",      note: "Hosting visiting instructors, open days, belt examinations, and community events." },
  { label: "Insurance & Administration", note: "Basic liability coverage and administrative running costs." },
];

const transferDetails = [
  { label: "Bank",           value: "To be confirmed" },
  { label: "Account Name",   value: "RenshinKan Dojo / Peace Culture Foundation" },
  { label: "Account Number", value: "To be confirmed" },
  { label: "Reference",      value: "DONATION – your name" },
];

const beltRanks = [
  "Beginner / No Belt Yet",
  "10 Kyu — White",
  "9 Kyu — White + Stripe",
  "8 Kyu — Blue",
  "7 Kyu — Blue + Stripe",
  "6 Kyu — Green",
  "5 Kyu — Green + Stripe",
  "4 Kyu — Brown",
  "3 Kyu — Brown + Stripe",
  "2 Kyu — Brown Double Stripe",
  "SHO Dan-Ho — Black",
  "Visiting Practitioner",
];

type PaymentMethod = "in-person" | "bank" | "credit-card";
type ContribStep = "form" | "in-person-success" | "bank-details" | "credit-card-form" | "credit-card-success";

const paymentOptions = [
  {
    value: "in-person" as PaymentMethod,
    label: "In Person",
    desc: "Speak with a sensei at the dojo to arrange your contribution directly.",
  },
  {
    value: "bank" as PaymentMethod,
    label: "Direct Bank Transfer",
    desc: "Set up a standing order from your bank to the dojo account.",
  },
  {
    value: "credit-card" as PaymentMethod,
    label: "Credit Card",
    desc: "Enroll in a monthly recurring charge to your card.",
  },
];

function formatCardNumber(v: string) {
  return v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function SupportPage() {
  const [transferOpen, setTransferOpen] = useState(false);

  // Contribution form
  const [step, setStep] = useState<ContribStep>("form");
  const [savedName, setSavedName] = useState("");
  const [savedAmount, setSavedAmount] = useState("");

  const [form, setForm] = useState({
    name: "",
    address: "",
    contact: "",
    rank: "",
    payment: "" as "" | PaymentMethod,
  });

  const [card, setCard] = useState({
    cardName: "",
    cardNumber: "",
    expiry: "",
    cvv: "",
    amount: "",
  });

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    setSavedName(form.name);
    if (form.payment === "in-person") setStep("in-person-success");
    else if (form.payment === "bank") setStep("bank-details");
    else if (form.payment === "credit-card") setStep("credit-card-form");
  }

  function handleCardSubmit(e: FormEvent) {
    e.preventDefault();
    setSavedAmount(card.amount);
    setStep("credit-card-success");
  }

  function reset() {
    setStep("form");
    setSavedName("");
    setSavedAmount("");
    setForm({ name: "", address: "", contact: "", rank: "", payment: "" });
    setCard({ cardName: "", cardNumber: "", expiry: "", cvv: "", amount: "" });
  }

  return (
    <>
      <MotionSection className="container-shell py-20">
        <p className="eyebrow">Support RenshinKan</p>
        <h1 className="section-title">
          Keep the dojo open. Keep practice accessible.
        </h1>
        <p className="section-copy">
          Two ways to help — a regular community contribution for those who
          train here, and a one-off donation for anyone who wants to support
          aikido in Chiang Mai.
        </p>
      </MotionSection>

      {/* Monthly Contribution */}
      <MotionSection id="monthly-contribution" className="container-shell scroll-mt-28 pb-20">

        {/* Top emphasis block */}
        <div className="mb-10 rounded-[2rem] bg-ink p-8 text-paper sm:p-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vermilion text-paper">
            <Repeat2 size={26} aria-hidden="true" />
          </div>
          <p className="eyebrow mt-7 text-mist/70">Community Upkeep</p>
          <h2 className="mt-4 max-w-3xl text-4xl leading-tight sm:text-5xl">
            This isn't a membership fee. It's everyone keeping the dojo alive together.
          </h2>
          <p className="mt-5 max-w-2xl text-paper/80 text-lg leading-8">
            Regular practitioners are invited — not required — to set up a
            small monthly contribution by bank transfer. There is no access
            gate behind it. You don't pay to train; you contribute because
            the dojo is shared, and shared things cost something to maintain.
          </p>
          <p className="mt-4 max-w-2xl text-paper/70">
            Think of it less as a subscription and more as a rotating round:
            everyone chips in a little so the place stays clean, the mats
            stay in good shape, and practice remains open to whoever walks
            through the door — including people who can't afford to contribute
            at all right now.
          </p>
          <div className="mt-7 inline-flex items-center gap-3 rounded-2xl bg-vermilion/20 px-5 py-3 ring-1 ring-vermilion/40">
            <ShieldCheck size={20} className="text-vermilion shrink-0" aria-hidden="true" />
            <p className="text-sm font-bold text-paper">
              Instructors at RenshinKan receive no payment from these contributions.
              Every baht goes back into the space you train in.
            </p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">

          {/* ── Contribution form (multi-step) ── */}
          <article className="surface rounded-[2rem] p-8 sm:p-10">

            {/* STEP: Registration form */}
            {step === "form" && (
              <form onSubmit={handleFormSubmit} className="flex flex-col gap-5">
                <h3 className="text-3xl text-ink">Register your contribution</h3>
                <p className="text-sm text-charcoal/75">
                  Fill in your details and choose how you'd like to contribute each month.
                </p>

                <div>
                  <label htmlFor="contrib-name" className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                    Full Name
                  </label>
                  <input
                    id="contrib-name"
                    className="input-field"
                    type="text"
                    required
                    placeholder="Your name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>

                <div>
                  <label htmlFor="contrib-address" className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                    Address
                  </label>
                  <input
                    id="contrib-address"
                    className="input-field"
                    type="text"
                    required
                    placeholder="Street address, city"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </div>

                <div>
                  <label htmlFor="contrib-contact" className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                    Email or Phone
                  </label>
                  <input
                    id="contrib-contact"
                    className="input-field"
                    type="text"
                    required
                    placeholder="email@example.com or +66…"
                    value={form.contact}
                    onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                  />
                </div>

                <div>
                  <label htmlFor="contrib-rank" className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                    Belt Rank
                  </label>
                  <select
                    id="contrib-rank"
                    className="input-field"
                    required
                    value={form.rank}
                    onChange={(e) => setForm((f) => ({ ...f, rank: e.target.value }))}
                  >
                    <option value="">Select your rank</option>
                    {beltRanks.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                    Preferred Payment Method
                  </p>
                  <div className="grid gap-2">
                    {paymentOptions.map((opt, i) => (
                      <label
                        key={opt.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                          form.payment === opt.value
                            ? "border-bamboo bg-bamboo/10"
                            : "border-ink/10 bg-paper/50 hover:border-bamboo/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value={opt.value}
                          required={i === 0}
                          className="mt-0.5 accent-bamboo"
                          checked={form.payment === opt.value}
                          onChange={() => setForm((f) => ({ ...f, payment: opt.value }))}
                        />
                        <div>
                          <p className="text-sm font-bold text-ink">{opt.label}</p>
                          <p className="mt-0.5 text-xs text-charcoal/65">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <button type="submit" className="btn-primary w-full justify-center">
                  Continue
                </button>
              </form>
            )}

            {/* STEP: In-person success */}
            {step === "in-person-success" && (
              <div className="flex flex-col items-center gap-5 py-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bamboo/15 text-bamboo">
                  <CheckCircle size={32} aria-hidden="true" />
                </div>
                <h3 className="text-3xl text-ink">Thank you, {savedName}.</h3>
                <p className="max-w-xs text-charcoal/75">
                  Please speak with a sensei at your next class. They'll walk you
                  through the details and agree on an amount that suits your situation.
                </p>
                <button onClick={reset} className="btn-secondary mt-2">
                  Go back
                </button>
              </div>
            )}

            {/* STEP: Bank details */}
            {step === "bank-details" && (
              <div className="flex flex-col gap-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bamboo/15 text-bamboo">
                  <CheckCircle size={26} aria-hidden="true" />
                </div>
                <h3 className="text-3xl text-ink">Thank you, {savedName}.</h3>
                <p className="text-sm text-charcoal/75">
                  Set up a standing order using the details below. Use your name
                  as the reference so we can keep track.
                </p>
                <div className="grid gap-4 rounded-2xl bg-bamboo/10 p-5 ring-1 ring-bamboo/20 sm:grid-cols-2">
                  {transferDetails.map((d) => (
                    <div key={d.label}>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-bamboo">
                        {d.label}
                      </p>
                      <p className="mt-1 text-sm font-bold text-ink">{d.value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-charcoal/55">
                  Bank details will be confirmed before launch. Contact us directly
                  if you'd like to start now and we'll send you the information.
                </p>
                <button onClick={reset} className="btn-secondary">
                  Go back
                </button>
              </div>
            )}

            {/* STEP: Credit card form */}
            {step === "credit-card-form" && (
              <form onSubmit={handleCardSubmit} className="flex flex-col gap-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vermilion/10 text-vermilion">
                  <CreditCard size={26} aria-hidden="true" />
                </div>
                <h3 className="text-3xl text-ink">Monthly card enrollment</h3>
                <p className="text-sm text-charcoal/75">
                  Your card will be charged the agreed amount each month. Cancel
                  any time — no questions asked.
                </p>

                <div>
                  <label htmlFor="card-name" className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                    Name on Card
                  </label>
                  <input
                    id="card-name"
                    className="input-field"
                    type="text"
                    required
                    placeholder="As it appears on your card"
                    value={card.cardName}
                    onChange={(e) => setCard((c) => ({ ...c, cardName: e.target.value }))}
                  />
                </div>

                <div>
                  <label htmlFor="card-number" className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                    Card Number
                  </label>
                  <input
                    id="card-number"
                    className="input-field font-mono tracking-widest"
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="0000 0000 0000 0000"
                    value={card.cardNumber}
                    onChange={(e) => setCard((c) => ({ ...c, cardNumber: formatCardNumber(e.target.value) }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="card-expiry" className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                      Expiry
                    </label>
                    <input
                      id="card-expiry"
                      className="input-field"
                      type="text"
                      inputMode="numeric"
                      required
                      placeholder="MM/YY"
                      value={card.expiry}
                      onChange={(e) => setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="card-cvv" className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                      CVV
                    </label>
                    <input
                      id="card-cvv"
                      className="input-field"
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={4}
                      placeholder="•••"
                      value={card.cvv}
                      onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="card-amount" className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/60">
                    Monthly Amount (THB)
                  </label>
                  <input
                    id="card-amount"
                    className="input-field"
                    type="number"
                    min="1"
                    required
                    placeholder="Amount agreed with your instructor"
                    value={card.amount}
                    onChange={(e) => setCard((c) => ({ ...c, amount: e.target.value }))}
                  />
                </div>

                <div className="rounded-2xl bg-bamboo/10 p-4 ring-1 ring-bamboo/20">
                  <p className="text-xs leading-5 text-charcoal/70">
                    By submitting you authorise a recurring monthly charge of the
                    amount above. You can cancel at any time by contacting an
                    instructor or messaging us directly.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={reset} className="btn-secondary flex-1 justify-center">
                    Back
                  </button>
                  <button type="submit" className="btn-primary flex-1 justify-center">
                    Enroll
                  </button>
                </div>
              </form>
            )}

            {/* STEP: Credit card success */}
            {step === "credit-card-success" && (
              <div className="flex flex-col items-center gap-5 py-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bamboo/15 text-bamboo">
                  <CheckCircle size={32} aria-hidden="true" />
                </div>
                <h3 className="text-3xl text-ink">You're enrolled, {savedName}.</h3>
                <p className="max-w-xs text-charcoal/75">
                  {savedAmount ? `฿${Number(savedAmount).toLocaleString()} will be charged to your card each month. ` : ""}
                  You'll receive a confirmation shortly. Cancel any time — just let us know.
                </p>
                <button onClick={reset} className="btn-secondary mt-2">
                  Done
                </button>
              </div>
            )}
          </article>

          {/* What it covers */}
          <article className="surface rounded-[2rem] p-8 sm:p-10">
            <h3 className="text-3xl text-ink">What your contribution covers</h3>
            <p className="mt-4 text-sm text-charcoal/75">
              Below is every category the dojo spends money on. Nothing else.
              Amounts are placeholders — actual figures will be shown once confirmed.
            </p>
            <div className="mt-6 divide-y divide-ink/10">
              {dojoExpenses.map((expense) => (
                <div key={expense.label} className="py-4">
                  <p className="text-sm font-bold text-ink">{expense.label}</p>
                  <p className="mt-1 text-xs leading-5 text-charcoal/65">{expense.note}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-[1.5rem] bg-ink p-5 text-paper">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-mist/70">
                A reminder worth repeating
              </p>
              <p className="mt-2 text-sm font-bold leading-6">
                Instructors are not compensated from these funds. They teach
                because they practice, and they practice because they believe
                in it. The money keeps the lights on — nothing more.
              </p>
            </div>
          </article>
        </div>
      </MotionSection>

      {/* Donations */}
      <MotionSection id="donations" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-10 max-w-3xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vermilion/10 text-vermilion">
            <Heart size={26} aria-hidden="true" />
          </div>
          <p className="eyebrow mt-7">Donations</p>
          <h2 className="section-title">
            Like what we do? Want to support aikido in Chiang Mai?
          </h2>
          <p className="section-copy">
            You don't have to train here to support the dojo. If you believe
            in what aikido builds — calm under pressure, respect, cooperative
            learning — a one-off donation is a direct way to keep it going.
            Every baht goes towards workshops, events, equipment, and keeping
            the dojo accessible to students who need flexibility.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[auto_1fr]">

          {/* QR Code */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-64 w-64 flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-bamboo/40 bg-paper/60 text-center">
              <QrCode size={48} className="text-bamboo/50" aria-hidden="true" />
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-charcoal/50">
                PromptPay QR Code
              </p>
              <p className="mt-2 px-6 text-xs text-charcoal/40">
                QR code to be added before launch
              </p>
            </div>
            <p className="max-w-[16rem] text-center text-xs text-charcoal/55">
              Scan with any Thai banking app to donate via PromptPay
            </p>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-6">
            <article className="surface rounded-[2rem] p-8">
              <h3 className="text-3xl text-ink">Where it goes</h3>
              <ul className="mt-5 grid gap-3">
                {[
                  "Workshops and guest instructor visits",
                  "Training equipment and mat maintenance",
                  "Belt examination events and materials",
                  "Community outreach and open-day costs",
                  "Keeping practice affordable for students with less flexibility",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-charcoal/80">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-vermilion" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-[1.5rem] bg-bamboo/10 p-4 ring-1 ring-bamboo/20">
                <p className="text-sm font-bold text-ink">
                  No part of your donation pays anyone's salary or personal income.
                  This is a community dojo, run by people who love the practice.
                </p>
              </div>
            </article>

            {/* Bank transfer accordion */}
            <div className="surface rounded-[2rem] overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between px-8 py-5 text-left"
                aria-expanded={transferOpen}
                onClick={() => setTransferOpen((o) => !o)}
              >
                <span className="font-bold text-ink">
                  Prefer to transfer directly? View bank details
                </span>
                <ChevronDown
                  size={20}
                  className={`shrink-0 text-charcoal/50 transition ${transferOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {transferOpen && (
                <div className="border-t border-ink/10 px-8 pb-7 pt-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {transferDetails.map((detail) => (
                      <div key={detail.label}>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/50">
                          {detail.label}
                        </p>
                        <p className="mt-1 font-bold text-ink">{detail.value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-6 text-xs text-charcoal/55">
                    Transfer details will be confirmed and updated here before launch.
                    Contact us directly if you'd like to donate now and we'll give
                    you the account information.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </MotionSection>
    </>
  );
}

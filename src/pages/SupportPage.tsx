import { CheckCircle, ChevronDown, Facebook, Heart, QrCode, Repeat2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { MotionSection } from "../components/MotionSection";
import { siteInfo } from "../data/siteContent";
import { assetPath } from "../utils/assetPath";

const dojoExpenses = [
  { label: "Electricity & Water", note: "Monthly utility bills for the training hall, changing rooms, and grounds." },
  { label: "Mat Cleaning & Upkeep", note: "Regular cleaning supplies, sanitising, and tatami maintenance." },
  { label: "Building Maintenance", note: "Ongoing repairs, painting, and general upkeep of the dojo structure and garden." },
  { label: "Training Equipment", note: "Replacement and maintenance of bokken, jo, tanto, and other practice gear." },
  { label: "Event & Seminar Costs", note: "Hosting visiting instructors, open days, belt examinations, and community events." },
  { label: "Garden & Grounds", note: "Maintaining the outdoor space, plants, pathways, and the area surrounding the dojo." },
  { label: "Student Welfare", note: "Drinking water, post-class refreshments, and small comforts that make the dojo welcoming." },
];

const transferDetails = [
  { label: "Current Details", value: "Request the current account or PromptPay details from the dojo before sending funds." },
  { label: "Account Name", value: "RenshinKan Dojo / Peace Culture Foundation" },
  { label: "Reference", value: "Use your name so the contribution can be matched correctly." },
];

const contributionSteps = [
  "Speak with a sensei before or after class.",
  "Confirm whether in-person payment, bank transfer, or PromptPay is best.",
  "Use your name as the transfer reference if sending funds digitally.",
  "Ask again whenever your situation changes. The dojo is maintained by community care.",
];

export function SupportPage() {
  const [transferOpen, setTransferOpen] = useState(false);

  return (
    <>
      <MotionSection className="container-shell py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.85fr]">
          <div>
            <p className="eyebrow">Support RenshinKan</p>
            <h1 className="section-title">Keep the dojo open. Keep practice accessible.</h1>
            <p className="section-copy">
              Two ways to help: a regular community contribution for those who
              train here, and a one-off donation for anyone who wants to support
              aikido and martial arts training in Chiang Mai.
            </p>
          </div>
          <div className="flex items-center justify-center">
            <img
              src={assetPath("/dojo-photos/image-community.png")}
              alt="RenshinKan Dojo community in Chiang Mai."
              className="w-full max-w-md rounded-[2rem] object-cover"
              style={{ maskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)", WebkitMaskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)" }}
              loading="eager"
            />
          </div>
        </div>
      </MotionSection>

      <MotionSection id="monthly-contribution" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-10 surface rounded-[2rem] p-8 sm:p-10">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.75fr]">
            <div>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-vermilion/10 text-vermilion">
                  <Repeat2 size={20} aria-hidden="true" />
                </div>
                <p className="eyebrow text-xs tracking-widest text-vermilion/80">Community Upkeep</p>
              </div>
              <h2 className="max-w-2xl text-3xl leading-snug text-ink sm:text-4xl">
                This dojo exists because its students take care of it.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-charcoal/75">
                Every student who trains regularly at RenshinKan is asked to contribute
                <strong className="text-ink"> 1,500 baht per month</strong>.
                This is not a membership fee. It is a shared responsibility. The lights,
                the water, the mats, the repairs, the space itself: all of it is held up
                by the people who use it.
              </p>
              <p className="mt-4 max-w-2xl text-base leading-7 text-charcoal/75">
                When everyone who trains here contributes, the dojo stays strong for
                current students, new beginners, and the wider Chiang Mai community.
              </p>
              <div className="mt-7 inline-flex items-center gap-3 rounded-xl border border-vermilion/20 bg-vermilion/5 px-4 py-3">
                <ShieldCheck size={18} className="shrink-0 text-vermilion" aria-hidden="true" />
                <p className="text-sm text-charcoal/70">
                  <span className="font-semibold text-ink">Instructors receive no payment from contributions.</span>{" "}
                  Every baht goes directly back into the space you train in.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center">
              <img
                src={assetPath("/dojo-photos/support.png")}
                alt="Students training aikido at RenshinKan Dojo in Hang Dong."
                className="w-full max-w-sm rounded-[2rem] object-cover"
                style={{ maskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)", WebkitMaskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)" }}
                loading="lazy"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <article className="surface rounded-[2rem] p-8 sm:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bamboo/15 text-bamboo">
              <CheckCircle size={26} aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-3xl text-ink">How to arrange a contribution</h3>
            <p className="mt-4 text-sm leading-6 text-charcoal/75">
              This static website does not process payments or collect payment details.
              Please arrange contributions directly with the dojo.
            </p>
            <ul className="mt-6 grid gap-3">
              {contributionSteps.map((step) => (
                <li key={step} className="flex items-start gap-3 text-sm text-charcoal/78">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-bamboo" aria-hidden="true" />
                  {step}
                </li>
              ))}
            </ul>
            <a
              href={siteInfo.facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-7 inline-flex"
            >
              <Facebook size={18} aria-hidden="true" />
              Message the Dojo
            </a>
          </article>

          <article className="surface rounded-[2rem] p-8 sm:p-10">
            <h3 className="text-3xl text-ink">What your contribution covers</h3>
            <p className="mt-4 text-sm text-charcoal/75">
              Below is every category the dojo spends money on. Nothing else.
            </p>
            <div className="mt-6 divide-y divide-ink/10">
              {dojoExpenses.map((expense) => (
                <div key={expense.label} className="py-4">
                  <p className="text-sm font-bold text-ink">{expense.label}</p>
                  <p className="mt-1 text-xs leading-5 text-charcoal/65">{expense.note}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-[1.5rem] bg-ink/90 p-5 text-paper backdrop-blur-sm">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-mist/70">A reminder worth repeating</p>
              <p className="mt-2 text-sm font-bold leading-6">
                Instructors are not compensated from these funds. They teach because they practice,
                and they practice because they believe in it. The money keeps the lights on.
              </p>
            </div>
          </article>
        </div>
      </MotionSection>

      <MotionSection id="donations" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-10 max-w-3xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vermilion/10 text-vermilion">
            <Heart size={26} aria-hidden="true" />
          </div>
          <p className="eyebrow mt-7">Donations</p>
          <h2 className="section-title">Want to support aikido in Chiang Mai?</h2>
          <p className="section-copy">
            You do not have to train here to support the dojo. If you believe
            in what aikido builds, a one-off donation is a direct way to keep
            practice accessible in Hang Dong and Chiang Mai.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-64 w-64 flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-bamboo/40 bg-paper/60 text-center">
              <QrCode size={48} className="text-bamboo/50" aria-hidden="true" />
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-charcoal/50">PromptPay QR Code</p>
              <p className="mt-2 px-6 text-xs text-charcoal/40">
                Message us directly to donate via PromptPay.
              </p>
            </div>
            <p className="max-w-[16rem] text-center text-xs text-charcoal/55">
              Request the current QR code before sending funds.
            </p>
          </div>

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

            <div className="surface overflow-hidden rounded-[2rem]">
              <button
                type="button"
                className="flex w-full items-center justify-between px-8 py-5 text-left"
                aria-expanded={transferOpen}
                onClick={() => setTransferOpen((open) => !open)}
              >
                <span className="font-bold text-ink">Prefer to transfer directly?</span>
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
                </div>
              )}
            </div>
          </div>
        </div>
      </MotionSection>
    </>
  );
}

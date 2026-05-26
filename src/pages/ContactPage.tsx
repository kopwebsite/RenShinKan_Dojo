import { Facebook } from "lucide-react";
import { LocationCard } from "../components/LocationCard";
import { MotionSection } from "../components/MotionSection";
import { siteInfo } from "../data/siteContent";

export function ContactPage() {
  return (
    <>
      <MotionSection id="visit" className="container-shell scroll-mt-28 py-20">
        <p className="eyebrow">Location & Contact</p>
        <h1 className="section-title">Plan a first visit to RenshinKan Dojo.</h1>
        <p className="section-copy">
          The dojo is located at {siteInfo.address}. Parents, beginners, experienced
          aikidoka, and visitors should get in touch for more information before
          attending class.
        </p>
      </MotionSection>

      <MotionSection id="location" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <LocationCard />
          <div className="grid gap-6">
            <article className="surface rounded-[2rem] p-6 sm:p-8">
              <p className="eyebrow">Get in Touch</p>
              <h2 className="mt-3 text-4xl text-ink">Prefer to message us through Facebook?</h2>
              <p className="mt-4 text-charcoal/80 leading-7">
                You're welcome to reach out to us directly on Facebook. We're happy to answer any questions about classes, schedules, or your first visit.
              </p>
              <a
                href={siteInfo.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-6 inline-flex"
              >
                <Facebook size={18} aria-hidden="true" />
                Message us on Facebook
              </a>
            </article>

            <article className="surface rounded-[2rem] p-6 sm:p-8">
              <p className="eyebrow">Before You Visit</p>
              <h2 className="mt-3 text-4xl text-ink">What to include in your message.</h2>
              <p className="mt-4 leading-7 text-charcoal/80">
                Tell us your age group, aikido or martial arts experience if any,
                and the class day you would like to visit. Beginners are welcome.
              </p>
              <ul className="mt-6 grid gap-3 text-sm text-charcoal/78">
                {[
                  "Wear comfortable clothes that allow movement.",
                  "Arrive a little early so someone can welcome you.",
                  "Parents may ask about observing children's practice.",
                  "Visiting aikidoka should mention rank and home dojo.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-vermilion" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={siteInfo.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-6 inline-flex"
              >
                <Facebook size={18} aria-hidden="true" />
                Ask about visiting class
              </a>
            </article>
          </div>
        </div>
      </MotionSection>
    </>
  );
}

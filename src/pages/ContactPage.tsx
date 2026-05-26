import { FormEvent, useState } from "react";
import { Facebook, Send } from "lucide-react";
import { LocationCard } from "../components/LocationCard";
import { MotionSection } from "../components/MotionSection";
import { siteInfo } from "../data/siteContent";

type ContactValues = {
  name: string;
  email: string;
  message: string;
};

const initialContactValues: ContactValues = {
  name: "",
  email: "",
  message: "",
};

export function ContactPage() {
  const [values, setValues] = useState<ContactValues>(initialContactValues);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

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

            <form className="surface rounded-[2rem] p-6 sm:p-8" onSubmit={handleSubmit}>
              <p className="eyebrow">Send a Message</p>
              <h2 className="mt-3 text-4xl text-ink">Ask about visiting class.</h2>
              <div className="mt-6 grid gap-5">
                <div>
                  <label htmlFor="contact-name" className="text-sm font-bold text-ink">
                    Name
                  </label>
                  <input
                    id="contact-name"
                    name="name"
                    className="input-field"
                    value={values.name}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, name: event.target.value }))
                    }
                    autoComplete="name"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="text-sm font-bold text-ink">
                    Email
                  </label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    className="input-field"
                    value={values.email}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, email: event.target.value }))
                    }
                    autoComplete="email"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="contact-message" className="text-sm font-bold text-ink">
                    Message
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    className="input-field min-h-36 resize-y"
                    value={values.message}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, message: event.target.value }))
                    }
                    placeholder="Tell us your age group, experience, and preferred visit day."
                    required
                  />
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="submit" className="btn-primary">
                  <Send size={17} aria-hidden="true" />
                  Send Message
                </button>
                <p className="text-sm text-charcoal/65" aria-live="polite">
                  {submitted
                    ? "Thank you. We will be in touch as soon as we can."
                    : "We will reply as soon as we can."}
                </p>
              </div>
            </form>
          </div>
        </div>
      </MotionSection>
    </>
  );
}

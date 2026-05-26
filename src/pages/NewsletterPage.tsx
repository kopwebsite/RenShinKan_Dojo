import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { MediaSlider } from "../components/MediaSlider";
import { NewsletterSignup } from "../components/NewsletterSignup";
import { MotionSection } from "../components/MotionSection";
import { dojoUpdates } from "../data/editableContent";
import { newsletters } from "../data/siteContent";

export function NewsletterPage() {
  const location = useLocation();
  const [activeEventIndex, setActiveEventIndex] = useState(0);
  const activeEvent = dojoUpdates[activeEventIndex];

  useEffect(() => {
    const slug = location.hash.replace("#", "");
    const index = dojoUpdates.findIndex((update) => update.slug === slug);
    if (index >= 0) {
      setActiveEventIndex(index);
    }
  }, [location.hash]);

  return (
    <>
      <MotionSection className="container-shell py-20">
        <p className="eyebrow">Newsletter</p>
        <h1 className="section-title">Gentle updates for families and students.</h1>
        <p className="section-copy">
          Sign up for beginner guidance, parent notes, workshop announcements, and
          reflections on calm practice.
        </p>
      </MotionSection>

      <MotionSection id="recent-events" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="eyebrow">Recent Events</p>
            <h2 className="section-title">Dojo moments to share with the community.</h2>
          </div>
          <p className="section-copy mt-0">
            Catch up on recent classes, belt promotion days, visiting instructor
            sessions, and other moments from the mat.
          </p>
        </div>

        <article id={activeEvent.slug} className="surface rounded-[2rem] p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div>
              <p className="text-sm font-bold text-bamboo">{activeEvent.date}</p>
              <h3 className="mt-5 text-4xl leading-tight text-ink sm:text-5xl">{activeEvent.subject}</h3>
              <p className="mt-5 max-w-3xl text-base leading-7 text-charcoal/75">{activeEvent.summary}</p>
              <p className="mt-5 max-w-3xl whitespace-pre-line text-sm leading-7 text-charcoal/78">
                {activeEvent.body}
              </p>
            </div>
            <MediaSlider media={activeEvent.media} label={`${activeEvent.subject} media`} />
          </div>
        </article>

        {dojoUpdates.length > 1 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {dojoUpdates.map((event, index) => {
              const isActive = index === activeEventIndex;
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setActiveEventIndex(index)}
                  className={`rounded-[1.5rem] border p-5 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo ${
                    isActive
                      ? "border-bamboo bg-bamboo/8 shadow-soft"
                      : "surface hover:border-ink/20"
                  }`}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-bamboo">{event.date}</p>
                  <p className={`mt-2 text-base font-medium leading-snug ${isActive ? "text-bamboo" : "text-ink"}`}>
                    {event.subject}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <NewsletterSignup idPrefix="main-newsletter" />
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">Recent Notes</p>
          <h2 className="section-title">Short writing for first steps and steady practice.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {newsletters.map((item) => (
            <article key={item.title} className="surface card-hover rounded-[2rem] p-6">
              <p className="text-sm font-bold text-bamboo">{item.date}</p>
              <h3 className="mt-4 text-3xl leading-tight text-ink">{item.title}</h3>
              <p className="mt-4 text-sm text-charcoal/75">{item.summary}</p>
            </article>
          ))}
        </div>
      </MotionSection>
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { MediaSlider } from "../components/MediaSlider";
import { NewsletterSignup } from "../components/NewsletterSignup";
import { MotionSection } from "../components/MotionSection";
import { newsletters } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { getPublishedRecentEvents, useEditableContent } from "../lib/content";

export function NewsletterPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const { content } = useEditableContent();
  const dojoUpdates = useMemo(() => getPublishedRecentEvents(content), [content]);
  const [activeEventIndex, setActiveEventIndex] = useState(0);
  const activeEvent = dojoUpdates[activeEventIndex];
  const activeMedia = activeEvent?.media?.length
    ? activeEvent.media
    : activeEvent?.image
      ? [activeEvent.image]
      : [];

  useEffect(() => {
    const slug = location.hash.replace("#", "");
    const index = dojoUpdates.findIndex((update) => update.slug === slug);
    if (index >= 0) {
      setActiveEventIndex(index);
    }
  }, [dojoUpdates, location.hash]);

  useEffect(() => {
    if (activeEventIndex >= dojoUpdates.length) {
      setActiveEventIndex(0);
    }
  }, [activeEventIndex, dojoUpdates.length]);

  return (
    <>
      <MotionSection className="container-shell py-20">
        <p className="eyebrow">{t("newsletter.intro.eyebrow")}</p>
        <h1 className="section-title">{t("newsletter.intro.title")}</h1>
        <p className="section-copy">
          {t("newsletter.intro.copy")}
        </p>
      </MotionSection>

      <MotionSection id="recent-events" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="eyebrow">{t("newsletter.recent.eyebrow")}</p>
            <h2 className="section-title">{t("newsletter.recent.title")}</h2>
          </div>
          <p className="section-copy mt-0">
            {t("newsletter.recent.copy")}
          </p>
        </div>

        {activeEvent ? (
          <article id={activeEvent.slug} className="surface rounded-[2rem] p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
              <div>
                <p className="text-sm font-bold text-bamboo">{activeEvent.date}</p>
                <h3 className="mt-5 text-4xl leading-tight text-ink sm:text-5xl">{activeEvent.title}</h3>
                <p className="mt-5 max-w-3xl text-base leading-7 text-charcoal/75">{activeEvent.summary}</p>
                <p className="mt-5 max-w-3xl whitespace-pre-line text-sm leading-7 text-charcoal/78">
                  {activeEvent.body}
                </p>
              </div>
              <MediaSlider media={activeMedia} label={`${activeEvent.title} media`} />
            </div>
          </article>
        ) : (
          <article className="surface rounded-[2rem] p-6 sm:p-8">
            <p className="text-sm leading-6 text-charcoal/72">
              Recent dojo updates will appear here after they are published.
            </p>
          </article>
        )}

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
                    {event.title}
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
          <p className="eyebrow">{t("newsletter.notes.eyebrow")}</p>
          <h2 className="section-title">{t("newsletter.notes.title")}</h2>
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

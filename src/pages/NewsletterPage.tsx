import { Languages } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { EventBodyRenderer } from "../components/EventBodyRenderer";
import { NewsletterSignup } from "../components/NewsletterSignup";
import { MotionSection } from "../components/MotionSection";
import { useTranslation, type Language } from "../i18n";
import { getPublishedRecentEvents, useEditableContent } from "../lib/content";

const googleTranslateTarget: Record<Language, string> = {
  en: "en",
  th: "th",
  "zh-CN": "zh-CN",
  ja: "ja",
};

function buildGoogleTranslateTextUrl(targetLanguage: string, text: string) {
  const params = new URLSearchParams({
    sl: "auto",
    tl: targetLanguage,
    text,
    op: "translate",
  });

  return `https://translate.google.com/?${params.toString()}`;
}

function NewsletterTranslateButton({
  title,
  text,
  className = "",
}: {
  title: string;
  text: string;
  className?: string;
}) {
  const { language, t } = useTranslation();
  const targetLanguage = googleTranslateTarget[language] ?? "en";
  const href = buildGoogleTranslateTextUrl(targetLanguage, text);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-bamboo/30 bg-paper/80 px-4 py-2 text-sm font-bold text-bamboo transition hover:border-bamboo hover:bg-bamboo/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo ${className}`}
      aria-label={t("newsletter.translate.aria", { title })}
    >
      <Languages size={16} aria-hidden="true" />
      {t("newsletter.translate.label")}
    </a>
  );
}

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
  const activeEventTranslationText = activeEvent
    ? [activeEvent.date, activeEvent.title, activeEvent.summary, activeEvent.body].filter(Boolean).join("\n\n")
    : "";

  useEffect(() => {
    const slug = location.hash.replace("#", "");
    const index = dojoUpdates.findIndex((update) => update.slug === slug);
    if (index >= 0) {
      setActiveEventIndex(index);
    }
  }, [dojoUpdates, location.hash]);

  // Scroll to the anchored section (e.g. #newsletter-signup, #recent-events)
  // after navigation settles. ScrollToTop resets to top on pathname change,
  // so we defer slightly to land on the target instead.
  useEffect(() => {
    const id = location.hash.replace("#", "");
    if (!id) {
      return;
    }

    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 90);

    return () => window.clearTimeout(timer);
  }, [location.hash, activeEvent?.slug]);

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
            <p className="text-sm font-bold text-bamboo">{activeEvent.date}</p>
            <h3 className="mt-5 text-3xl leading-tight text-ink sm:text-5xl">{activeEvent.title}</h3>
            <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <p className="max-w-3xl text-base leading-7 text-charcoal/75">{activeEvent.summary}</p>
              <NewsletterTranslateButton
                title={activeEvent.title}
                text={activeEventTranslationText}
                className="lg:shrink-0"
              />
            </div>
            <EventBodyRenderer
              body={activeEvent.body}
              media={activeMedia}
              fallbackTitle={activeEvent.title}
              className="mt-6 max-w-4xl"
            />
          </article>
        ) : (
          <article className="surface rounded-[2rem] p-6 sm:p-8">
            <p className="text-sm leading-6 text-charcoal/72">
              {t("newsletter.recent.empty")}
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

      <MotionSection id="newsletter-signup" className="container-shell scroll-mt-28 pb-20">
        <NewsletterSignup idPrefix="main-newsletter" />
      </MotionSection>
    </>
  );
}

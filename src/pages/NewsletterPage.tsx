import { FacebookTimelineEmbed } from "../components/FacebookTimelineEmbed";
import { NewsletterSignup } from "../components/NewsletterSignup";
import { MotionSection } from "../components/MotionSection";
import { newsletters } from "../data/siteContent";

export function NewsletterPage() {
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

      <MotionSection className="container-shell pb-20">
        <FacebookTimelineEmbed />
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

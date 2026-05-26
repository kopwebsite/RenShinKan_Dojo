import { Eye, Medal } from "lucide-react";
import { Link } from "react-router-dom";
import { BeltCarousel } from "../components/BeltCarousel";
import { FAQAccordion } from "../components/FAQAccordion";
import { MotionSection } from "../components/MotionSection";
import { assetPath } from "../utils/assetPath";

export function ClassesPage() {
  return (
    <>
      {/* Information */}
      <MotionSection id="information" className="container-shell scroll-mt-28 py-16">
        <p className="eyebrow">Classes & Parent Guide</p>
        <h1 className="section-title">
          Safe practice, real progress, and a clear first step.
        </h1>
        <p className="section-copy">
          Classes are open to beginners, children, teens, families, and visiting
          aikidoka. Every session follows the same structure — the first half is
          dedicated to beginners learning fundamentals, and the second half
          shifts to more serious adult practice and refinement. Message us ahead
          of your first visit to find the best fit.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <article className="surface rounded-[1.75rem] p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-bamboo">
              First Half
            </p>
            <h2 className="mt-3 text-3xl text-ink">Beginners</h2>
            <p className="mt-3 text-sm text-charcoal/75">
              The opening portion of every class is designed for people just
              starting out — safe falling, basic posture, footwork, and
              partner awareness at a measured pace.
            </p>
          </article>
          <article className="surface rounded-[1.75rem] p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-vermilion">
              Second Half
            </p>
            <h2 className="mt-3 text-3xl text-ink">All Levels / Serious Practice</h2>
            <p className="mt-3 text-sm text-charcoal/75">
              The second portion moves into more demanding technique work,
              combinations, and partner drills suited to adults and students
              who are ready to push further.
            </p>
          </article>
        </div>
      </MotionSection>

      {/* Schedule */}
      <MotionSection id="schedule" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="eyebrow">Weekly Schedule</p>
            <h2 className="section-title">Four sessions a week, every week.</h2>
            <p className="section-copy">
              Tuesday and Thursday evenings, Saturday and Sunday mornings.
              Each class runs for 90 minutes and follows the same two-part
              structure — beginners first, then all levels.
            </p>
            <Link to="/contact" className="btn-secondary mt-7">
              <Eye size={17} aria-hidden="true" />
              Observe a Class
            </Link>
          </div>
          <img
            src={assetPath("/dojo-photos/schedule.png")}
            alt="Weekly class schedule: Tuesday and Thursday 17:30–19:00, Saturday and Sunday 9:00–10:30"
            className="w-full rounded-[1.75rem] object-contain shadow-line"
          />
        </div>
      </MotionSection>

      {/* First Visit Guide */}
      <MotionSection id="first-visit" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <p className="eyebrow">First Visit Guide</p>
            <h2 className="section-title">A calm first class starts with a few simple steps.</h2>
            <p className="section-copy">
              This guide is for beginners, parents, and visiting aikidoka. Message
              ahead so we can confirm the right class time and whether to observe
              or join in.
            </p>
            <Link to="/contact" className="btn-primary mt-7">
              Ask About Visiting
            </Link>
          </div>
          <article className="surface rounded-[2rem] p-6 sm:p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
              <Eye size={24} aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-3xl text-ink">Before you arrive</h3>
            <ul className="mt-6 grid gap-3">
              {[
                "Message ahead to confirm class time and what to expect",
                "Arrive at least 30 minutes early to help with preparing the dojo",
                "Wear loose trousers and a t-shirt — no keikogi needed first visit",
                "Remove shoes before stepping onto the mat",
                "Sit quietly at the edge or the viewing deck until invited on",
                "Let the instructor or a senior student guide you through the bow-in",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-charcoal/80">
                  <span className="h-2.5 w-2.5 rounded-full bg-vermilion" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </MotionSection>

      {/* Belt Exams */}
      <MotionSection id="belt-exams" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vermilion text-paper">
            <Medal size={26} aria-hidden="true" />
          </div>
          <p className="eyebrow mt-7">Belt Exams</p>
          <h2 className="section-title">
            Next examination date to be announced.
          </h2>
          <p className="section-copy max-w-3xl">
            Belt examinations follow the All Dojo Chiang Mai standard under
            Aikikai affiliation. Progress through the kyu system requires
            completing the listed techniques and a minimum number of training
            days at each level. The table below shows what is needed to advance.
          </p>
        </div>

        <img
          src={assetPath("/dojo-photos/belt-promotion-test.png")}
          alt="Belt Promotion Test chart showing requirements from 10 Kyu to Sho Dan-Ho"
          className="mx-auto block w-full max-w-2xl rounded-[1.75rem] object-contain shadow-line"
        />

        {/* Belt exam graduation gallery */}
        <div className="mt-14">
          <p className="eyebrow mb-2">Graduation Moments</p>
          <h3 className="section-title mb-8">Students who've passed the test.</h3>
          <BeltCarousel />
        </div>
      </MotionSection>

      {/* FAQ */}
      <MotionSection id="faq" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">Parent FAQ</p>
          <h2 className="section-title">Answers before the first bow.</h2>
        </div>
        <FAQAccordion />
      </MotionSection>
    </>
  );
}

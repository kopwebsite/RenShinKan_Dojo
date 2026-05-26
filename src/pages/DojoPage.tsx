import { CalendarDays, ExternalLink, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { BrushCircleLogo } from "../components/BrushCircleLogo";
import { DojoJourney } from "../components/DojoJourney";
import { FacilityGrid } from "../components/FacilityGrid";
import { InstructorGrid } from "../components/InstructorGrid";
import { LocationCard } from "../components/LocationCard";
import { MotionSection } from "../components/MotionSection";
import { dojoJourney, dojoPhotos, siteInfo } from "../data/siteContent";
import { assetPath } from "../utils/assetPath";

export function DojoPage() {
  return (
    <>
      <section className="relative isolate min-h-[68svh] overflow-hidden">
        {/* Watercolour koi background */}
        <img
          src={assetPath("/dojo-photos/new-hero-poster.png")}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
        />

        <div className="relative container-shell grid min-h-[68svh] place-items-center py-14 text-center">
          <div className="relative mx-auto max-w-5xl">
            <div className="absolute left-1/2 top-1/2 -z-10 h-[18rem] w-[18rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-bamboo/15 sm:h-[27rem] sm:w-[27rem]" />
            <BrushCircleLogo paintOn className="mx-auto mb-5 h-28 w-28 sm:h-40 sm:w-40" />
            <p className="eyebrow">RenshinKan Dojo · {siteInfo.location}</p>
            <h1 className="mx-auto mt-3 max-w-4xl text-5xl leading-[0.98] text-ink sm:text-6xl lg:text-7xl">
              Aikido in Chiang Mai — calm strength through harmony.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-charcoal/80 sm:text-lg sm:leading-8">
              Tucked away in Hang Dong since 2013, RenshinKan is a small dojo
              with one focus: learning to move with people, not against them.
              Kids, beginners, and seasoned aikidoka all train together on the
              same mat. No competition. No performance. Just practice.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/contact" className="btn-primary">
                <MessageCircle size={18} aria-hidden="true" />
                Visit a Class
              </Link>
              <Link to="/workshops" className="btn-secondary">
                <CalendarDays size={18} aria-hidden="true" />
                View Workshops
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MotionSection id="facilities" className="container-shell pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">The Space</p>
          <h2 className="section-title">A purpose-built practice space in Hang Dong.</h2>
          <p className="section-copy">
            RenshinKan was built in {siteInfo.builtYear} on a quiet property in
            Baan Waen. The space is designed for comfortable, focused practice
            for students of all ages.
          </p>
        </div>
        <FacilityGrid />
      </MotionSection>

      <MotionSection id="instructors" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-9 max-w-3xl">
          <p className="eyebrow">Who Teaches Here</p>
          <h2 className="section-title">A line of practice rooted in Chiang Mai.</h2>
          <p className="section-copy">
            Our instructors bring decades of dedicated practice to every class —
            patient, consistent teachers who care more about your progress than
            their credentials.
          </p>
        </div>
        <InstructorGrid />
      </MotionSection>

      <MotionSection id="dojo-photos" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-9">
          <p className="eyebrow">Dojo Photos</p>
          <h2 className="section-title">The dojo, the mat, and the people on it.</h2>
          <p className="section-copy">
            A look at the training space and the students who use it.
          </p>
        </div>

        <p className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-charcoal/55">
          The Space
        </p>
        <div className="mb-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {dojoPhotos.map((photo) => (
            <div key={photo.src} className="card-hover overflow-hidden rounded-[1.75rem]">
              <img
                src={photo.src}
                alt={photo.alt}
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>

        <p className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-charcoal/55">
          On the Mat
        </p>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {dojoJourney.map((photo) => (
            <div key={photo.imageSrc} className="card-hover overflow-hidden rounded-[1.75rem]">
              <img
                src={photo.imageSrc}
                alt={photo.alt}
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </MotionSection>

      <MotionSection id="dojo-history" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-9 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">Dojo Journey</p>
            <h2 className="section-title">From open ground to a working mat.</h2>
            <p className="section-copy">
              Selected crops from the Peace Culture Foundation build gallery show
              the RenshinKan site, construction, tatami installation, opening
              practice, and early community moments.
            </p>
          </div>
          <a
            href={siteInfo.foundationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            Source Gallery
            <ExternalLink size={17} aria-hidden="true" />
          </a>
        </div>
        <DojoJourney />
      </MotionSection>

      <MotionSection id="location" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-stretch">
          <article className="rounded-[2rem] bg-paper/75 p-8 shadow-line ring-1 ring-ink/10 sm:p-10">
            <p className="eyebrow">Getting Here</p>
            <h2 className="mt-4 text-4xl leading-tight text-ink sm:text-5xl">
              Find the dojo before your first visit.
            </h2>
            <p className="mt-5 text-charcoal/78">
              RenshinKan Dojo is in Baan Waen, Hang Dong. Parents and visitors
              can use the map to plan arrival, then message ahead so the dojo can
              confirm the best class time and where to observe.
            </p>
            <Link to="/contact" className="btn-primary mt-7">
              Plan Your Visit
            </Link>
          </article>
          <LocationCard />
        </div>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="rounded-[2rem] bg-ink p-8 text-paper sm:p-10">
          <p className="eyebrow text-mist/70">Visitor Note</p>
          <h2 className="mt-4 max-w-3xl text-4xl leading-tight sm:text-5xl">
            A respectful first visit starts before stepping onto the mat.
          </h2>
          <p className="mt-5 max-w-2xl text-paper/75">
            Message ahead, arrive a little early, sit quietly at the edge of the
            mat or viewing deck, and let a senior member or instructor guide you.
          </p>
        </div>
      </MotionSection>
    </>
  );
}

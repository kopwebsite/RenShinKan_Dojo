import { Link } from "react-router-dom";
import { MotionSection } from "../components/MotionSection";
import { WorkshopCards } from "../components/WorkshopCards";

export function WorkshopsPage() {
  return (
    <>
      <MotionSection className="container-shell py-20">
        <p className="eyebrow">Workshops & Events</p>
        <h1 className="section-title">
          Focused practice for beginners, children, weapons study, and visitors.
        </h1>
        <p className="section-copy">
          Workshop data is realistic mock content and marked as placeholder. It can
          be replaced as dates are confirmed throughout the year.
        </p>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <WorkshopCards />
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="rounded-[2rem] bg-bamboo p-8 text-paper sm:p-10">
          <p className="eyebrow text-paper/70">Updates</p>
          <h2 className="mt-4 max-w-2xl text-4xl leading-tight sm:text-5xl">
            Subscribe for class notes and new workshop announcements.
          </h2>
          <Link to="/newsletter" className="btn-secondary mt-7 border-paper/20 bg-paper/10 text-paper hover:text-paper">
            Subscribe to Updates
          </Link>
        </div>
      </MotionSection>
    </>
  );
}

import { InstructorGrid } from "../components/InstructorGrid";
import { MotionSection } from "../components/MotionSection";
import { instructorSource } from "../data/siteContent";

export function InstructorsPage() {
  return (
    <>
      <MotionSection className="container-shell py-20">
        <p className="eyebrow">Instructors</p>
        <h1 className="section-title">Meet the aikido instructors at RenshinKan Dojo.</h1>
        <p className="section-copy">
          Get to know the teachers who guide class practice, introduce beginners
          to aikido, and help students build calm movement, respectful partner
          training, and steady confidence on the mat.
        </p>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <p className="sr-only">{instructorSource.note}</p>
        <InstructorGrid />
      </MotionSection>
    </>
  );
}

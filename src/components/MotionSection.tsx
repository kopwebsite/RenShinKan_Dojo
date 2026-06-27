import type { CSSProperties, PropsWithChildren } from "react";

type MotionSectionProps = PropsWithChildren<{
  id?: string;
  className?: string;
  ariaLabelledby?: string;
  delay?: number;
}>;

export function MotionSection({
  children,
  className,
  id,
  ariaLabelledby,
  delay = 0,
}: MotionSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      className={`motion-section ${className ?? ""}`}
      style={{ "--motion-delay": `${delay}s` } as CSSProperties}
    >
      {children}
    </section>
  );
}

import { motion, useReducedMotion } from "framer-motion";
import type { PropsWithChildren } from "react";

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
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      id={id}
      aria-labelledby={ariaLabelledby}
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 28 }}
      whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: 0.72, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  );
}

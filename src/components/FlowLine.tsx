import { motion, useReducedMotion } from "framer-motion";

export function FlowLine({ className = "" }: { className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 420"
      className={`pointer-events-none absolute inset-x-0 top-10 -z-10 h-[420px] w-full opacity-70 ${className}`}
      preserveAspectRatio="none"
    >
      <motion.path
        d="M-30 260 C 130 110, 330 120, 465 230 S 760 360, 935 188 S 1130 70, 1250 145"
        fill="none"
        stroke="hsl(var(--color-vermilion) / 0.35)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="7 22"
        initial={shouldReduceMotion ? false : { pathLength: 0, opacity: 0 }}
        animate={shouldReduceMotion ? undefined : { pathLength: 1, opacity: 1 }}
        transition={{ duration: 3.8, ease: "easeInOut" }}
      />
      <path
        d="M-20 318 C 190 220, 350 285, 520 168 S 800 52, 1010 254 S 1180 330, 1250 260"
        fill="none"
        stroke="hsl(var(--color-bamboo) / 0.22)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

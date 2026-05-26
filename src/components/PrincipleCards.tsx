import { motion, useReducedMotion } from "framer-motion";
import { principles } from "../data/siteContent";

export function PrincipleCards() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {principles.map((principle, index) => (
        <motion.article
          key={principle.title}
          className="surface card-hover relative overflow-hidden rounded-[2rem] p-6"
          whileHover={
            shouldReduceMotion
              ? undefined
              : { y: -8, rotate: index % 2 === 0 ? 1.2 : -1.2 }
          }
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
        >
          <span
            className="absolute -right-8 -top-8 h-24 w-24 rounded-full border border-vermilion/25"
            aria-hidden="true"
          />
          <span className="text-sm font-bold text-vermilion">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="mt-6 text-2xl leading-tight text-ink">{principle.title}</h3>
          <p className="mt-4 text-sm text-charcoal/75">{principle.description}</p>
        </motion.article>
      ))}
    </div>
  );
}

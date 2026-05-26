import { MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

export function FloatingFirstVisit() {
  return (
    <Link
      to="/contact"
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-vermilion px-4 py-3 text-sm font-bold text-paper shadow-soft transition hover:-translate-y-0.5 md:hidden"
    >
      <MessageCircle size={18} aria-hidden="true" />
      First Visit
    </Link>
  );
}

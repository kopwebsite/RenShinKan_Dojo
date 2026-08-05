import { Bot } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAdminTranslation } from "../../i18n";
import { useAdminSession } from "./useAdminSession";
import "./admin-auggie.css";

// Only the small floating button ships with the administration pages. The panel
// itself, its English and Thai wording and its own styles are fetched the first
// time an administrator opens it, so an administrator who never opens Admin
// Auggie never downloads any of it.
const AdminAuggiePanel = lazy(() =>
  import("./AdminAuggiePanel").then((module) => ({
    default: module.AdminAuggiePanel,
  })),
);

const LAUNCHER_LABEL = {
  en: "Open Admin Auggie",
  th: "เปิด Admin Auggie",
};

export function AdminAuggieLauncher() {
  const { status, admin } = useAdminSession();
  const { language } = useAdminTranslation();
  const locale: "en" | "th" = language === "th" ? "th" : "en";
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (status !== "authenticated" || !admin) setOpen(false);
  }, [admin, status]);

  if (status !== "authenticated" || !admin) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="admin-auggie-launcher"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={LAUNCHER_LABEL[locale]}
        onClick={() => setOpen(true)}
      >
        <Bot size={21} aria-hidden="true" />
        <span>Admin Auggie</span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <AdminAuggiePanel
            open
            onClose={() => setOpen(false)}
            triggerRef={triggerRef}
          />
        </Suspense>
      )}
    </>
  );
}

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

let openDialogCount = 0;

type AccessibleDialogProps = {
  open: boolean;
  onClose(): void;
  titleId?: string;
  ariaLabel?: string;
  descriptionId?: string;
  backdropClassName?: string;
  panelClassName?: string;
  panelAs?: "section" | "aside";
  triggerRef?: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  children: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AccessibleDialog({
  open,
  onClose,
  titleId,
  ariaLabel,
  descriptionId,
  backdropClassName = "accessible-dialog-backdrop",
  panelClassName = "accessible-dialog-panel",
  panelAs = "section",
  triggerRef,
  initialFocusRef,
  closeOnBackdrop = true,
  children,
}: AccessibleDialogProps) {
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const root = document.getElementById("root");
    const previousOverflow = document.body.style.overflow;
    const nested = openDialogCount > 0;
    openDialogCount += 1;
    document.body.style.overflow = "hidden";
    if (!nested) root?.setAttribute("inert", "");

    const focusable = () =>
      [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) =>
          !element.hasAttribute("hidden") &&
          element.getAttribute("aria-hidden") !== "true",
      );
    (initialFocusRef?.current || focusable()[0] || panel).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0) {
        root?.removeAttribute("inert");
        document.body.style.overflow = previousOverflow;
      }
      triggerRef?.current?.focus();
    };
  }, [initialFocusRef, open, triggerRef]);

  if (!open) return null;
  const Panel = panelAs;
  return createPortal(
    <div
      className={backdropClassName}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <Panel
        ref={panelRef as RefObject<HTMLElement>}
        className={panelClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : ariaLabel}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        {children}
      </Panel>
    </div>,
    document.body,
  );
}

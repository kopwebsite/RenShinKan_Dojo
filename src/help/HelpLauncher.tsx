import { CircleHelp, LoaderCircle, X } from "lucide-react";
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { AccessibleDialog } from "../components/AccessibleDialog";
import {
  useAdminTranslation,
  useTranslation,
  type AdminLanguage,
  type Language,
} from "../i18n";
import type { HelpAudience } from "./types";
import "./help-launcher.css";

type LauncherCopy = {
  trigger: string;
  aria: string;
  heading: string;
  close: string;
  loading: string;
  unavailable: string;
  retry: string;
};

const publicCopy: Record<Language, LauncherCopy> = {
  en: {
    trigger: "Help",
    aria: "Open website help",
    heading: "How to use this website",
    close: "Close help",
    loading: "Loading help",
    unavailable:
      "Help could not be loaded. The rest of the website is still available.",
    retry: "Try again",
  },
  th: {
    trigger: "ช่วยเหลือ",
    aria: "เปิดคู่มือเว็บไซต์",
    heading: "วิธีใช้เว็บไซต์นี้",
    close: "ปิดคู่มือ",
    loading: "กำลังโหลดคู่มือ",
    unavailable: "โหลดคู่มือไม่ได้ แต่ส่วนอื่นของเว็บไซต์ยังใช้งานได้",
    retry: "ลองอีกครั้ง",
  },
  ja: {
    trigger: "ヘルプ",
    aria: "ウェブサイトのヘルプを開く",
    heading: "このウェブサイトの使い方",
    close: "ヘルプを閉じる",
    loading: "ヘルプを読み込み中",
    unavailable: "ヘルプを読み込めませんでした。ほかの機能は利用できます。",
    retry: "再試行",
  },
  "zh-CN": {
    trigger: "帮助",
    aria: "打开网站帮助",
    heading: "如何使用本网站",
    close: "关闭帮助",
    loading: "正在加载帮助",
    unavailable: "无法加载帮助内容，网站其他部分仍可使用。",
    retry: "重试",
  },
};

const adminCopy: Record<AdminLanguage, LauncherCopy> = {
  en: {
    trigger: "Admin help",
    aria: "Open admin help",
    heading: "How to use administration",
    close: "Close admin help",
    loading: "Loading admin help",
    unavailable:
      "Admin help could not be loaded. Administration remains available.",
    retry: "Try again",
  },
  th: {
    trigger: "คู่มือผู้ดูแล",
    aria: "เปิดคู่มือผู้ดูแล",
    heading: "วิธีใช้ระบบผู้ดูแล",
    close: "ปิดคู่มือผู้ดูแล",
    loading: "กำลังโหลดคู่มือผู้ดูแล",
    unavailable: "โหลดคู่มือผู้ดูแลไม่ได้ แต่ส่วนผู้ดูแลยังใช้งานได้",
    retry: "ลองอีกครั้ง",
  },
};

class HelpLoadBoundary extends Component<
  { children: ReactNode; resetKey: number; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _details: ErrorInfo) {
    // The fallback is deliberately isolated so a help chunk failure cannot break the website.
  }
  componentDidUpdate(previous: Readonly<{ resetKey: number }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed)
      this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function LauncherDialog({
  copy,
  triggerRef,
  message,
  retry,
  onClose,
}: {
  copy: LauncherCopy;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  message: string;
  retry?: () => void;
  onClose(): void;
}) {
  return (
    <AccessibleDialog
      open
      onClose={onClose}
      triggerRef={triggerRef}
      titleId="help-loader-title"
      backdropClassName="help-loader-backdrop"
      panelClassName="help-loader-dialog"
    >
      <header>
        <h2 id="help-loader-title">{copy.heading}</h2>
        <button type="button" onClick={onClose} aria-label={copy.close}>
          <X aria-hidden="true" />
        </button>
      </header>
      <p role="status">{message}</p>
      {retry ? (
        <button
          className="help-loader-dialog__retry"
          type="button"
          onClick={retry}
        >
          {copy.retry}
        </button>
      ) : (
        <LoaderCircle
          className="help-loader-dialog__spinner"
          aria-hidden="true"
        />
      )}
    </AccessibleDialog>
  );
}

export function HelpLauncher({ audience }: { audience: HelpAudience }) {
  const { language: publicLanguage } = useTranslation();
  const { language: adminLanguage } = useAdminTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const locale = audience === "admin" ? adminLanguage : publicLanguage;
  const copy =
    audience === "admin"
      ? adminCopy[adminLanguage]
      : publicCopy[publicLanguage];
  const HelpPanel = useMemo(
    () =>
      lazy(() =>
        import("./HelpPanel").then((module) => ({ default: module.HelpPanel })),
      ),
    [retryKey],
  );
  const open = manuallyOpen || new URLSearchParams(location.search).has("help");

  const close = useCallback(() => {
    setManuallyOpen(false);
    const params = new URLSearchParams(location.search);
    if (params.delete("help")) {
      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
          hash: location.hash,
        },
        { replace: true },
      );
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  return (
    <>
      <button
        ref={triggerRef}
        className={`help-launcher help-launcher--${audience}`}
        type="button"
        aria-label={copy.aria}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setManuallyOpen(true)}
      >
        <CircleHelp size={21} aria-hidden="true" />
        <span>{copy.trigger}</span>
      </button>
      {open ? (
        <HelpLoadBoundary
          resetKey={retryKey}
          fallback={
            <LauncherDialog
              copy={copy}
              triggerRef={triggerRef}
              message={copy.unavailable}
              retry={() => setRetryKey((key) => key + 1)}
              onClose={close}
            />
          }
        >
          <Suspense
            fallback={
              <LauncherDialog
                copy={copy}
                triggerRef={triggerRef}
                message={copy.loading}
                onClose={close}
              />
            }
          >
            <HelpPanel
              audience={audience}
              locale={locale}
              onClose={close}
              triggerRef={triggerRef}
            />
          </Suspense>
        </HelpLoadBoundary>
      ) : null}
    </>
  );
}

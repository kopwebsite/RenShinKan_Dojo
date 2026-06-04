import { CalendarDays, Mail, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";

type NewsletterSignupProps = {
  compact?: boolean;
  idPrefix?: string;
};

// Fallback height used until (or unless) the Brevo form reports its own height.
// The iframe is cropped to Brevo's own form container while keeping the title,
// email field, Turnstile challenge, and Subscribe button visible.
const DEFAULT_FRAME_HEIGHT = 820;
const BREVO_FORM_MAX_WIDTH = 540;
const BREVO_FRAME_OVERSCAN_X = 20;
const BREVO_FRAME_CROP_TOP = 40;
const BREVO_FRAME_CROP_BOTTOM = 24;
const BREVO_VISIBLE_HEIGHT_WIDE = 398;
const BREVO_VISIBLE_HEIGHT_MEDIUM = 428;
const BREVO_VISIBLE_HEIGHT_NARROW = 452;
const BREVO_VISIBLE_HEIGHT_VERY_NARROW = 500;

const benefits = [
  {
    icon: CalendarDays,
    titleKey: "newsletter.signup.benefits.workshops.title",
    copyKey: "newsletter.signup.benefits.workshops.copy",
  },
  {
    icon: Sparkles,
    titleKey: "newsletter.signup.benefits.classes.title",
    copyKey: "newsletter.signup.benefits.classes.copy",
  },
  {
    icon: Users,
    titleKey: "newsletter.signup.benefits.community.title",
    copyKey: "newsletter.signup.benefits.community.copy",
  },
  {
    icon: ShieldCheck,
    titleKey: "newsletter.signup.benefits.privacy.title",
    copyKey: "newsletter.signup.benefits.privacy.copy",
  },
] as const;

function getSignupUrl() {
  const value = import.meta.env.VITE_BREVO_SIGNUP_FORM_URL;

  if (!value || value.includes("PLACEHOLDER")) {
    return "";
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function extractHeight(data: unknown): number | undefined {
  if (typeof data === "number") {
    return data;
  }

  if (typeof data === "string") {
    try {
      return extractHeight(JSON.parse(data));
    } catch {
      return undefined;
    }
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const candidate = record.frameHeight ?? record.height ?? record.scrollHeight;
    return typeof candidate === "number" ? candidate : undefined;
  }

  return undefined;
}

export function NewsletterSignup({ compact = false, idPrefix = "newsletter" }: NewsletterSignupProps) {
  const { t } = useTranslation();
  const signupUrl = getSignupUrl();
  const canEmbed = signupUrl.includes("sibforms.com");
  const formShellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(DEFAULT_FRAME_HEIGHT);
  const [frameWidth, setFrameWidth] = useState(BREVO_FORM_MAX_WIDTH);

  useEffect(() => {
    if (!canEmbed || typeof window === "undefined") {
      return;
    }

    const node = formShellRef.current;
    if (!node) {
      return;
    }

    const updateFrameWidth = () => setFrameWidth(node.offsetWidth);
    updateFrameWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFrameWidth);
      return () => window.removeEventListener("resize", updateFrameWidth);
    }

    const observer = new ResizeObserver(updateFrameWidth);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [canEmbed]);

  useEffect(() => {
    if (!canEmbed) {
      return;
    }

    function onMessage(event: MessageEvent) {
      if (!event.origin.includes("sibforms.com")) {
        return;
      }

      const height = extractHeight(event.data);

      // Ignore implausible values; only grow/shrink to a real reported height.
      if (typeof height === "number" && height > 200 && height < 2000) {
        setFrameHeight(Math.ceil(height));
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [canEmbed]);

  const targetVisibleHeight = frameWidth < 300
    ? BREVO_VISIBLE_HEIGHT_VERY_NARROW
    : frameWidth < 430
      ? BREVO_VISIBLE_HEIGHT_NARROW
      : frameWidth < 480
        ? BREVO_VISIBLE_HEIGHT_MEDIUM
      : BREVO_VISIBLE_HEIGHT_WIDE;
  const visibleFrameHeight = Math.min(
    Math.max(frameHeight - BREVO_FRAME_CROP_TOP - BREVO_FRAME_CROP_BOTTOM, targetVisibleHeight),
    targetVisibleHeight,
  );
  const effectiveFrameHeight = Math.max(
    frameHeight,
    visibleFrameHeight + BREVO_FRAME_CROP_TOP + BREVO_FRAME_CROP_BOTTOM,
  );

  const formColumn = signupUrl ? (
    canEmbed ? (
      <div
        ref={formShellRef}
        className="relative mx-auto w-full overflow-hidden rounded-[3px] bg-transparent transition-[height] duration-300"
        style={{
          height: visibleFrameHeight,
          maxWidth: BREVO_FORM_MAX_WIDTH,
        }}
      >
        <iframe
          ref={frameRef}
          id={`${idPrefix}-brevo-form`}
          title={t("newsletter.signup.frameTitle", { brand: t("common.brand") })}
          src={signupUrl}
          scrolling="no"
          style={{
            height: effectiveFrameHeight,
            width: `calc(100% + ${BREVO_FRAME_OVERSCAN_X * 2}px)`,
            transform: `translate(-${BREVO_FRAME_OVERSCAN_X}px, -${BREVO_FRAME_CROP_TOP}px)`,
          }}
          className="block max-w-none border-0 bg-paper transition-[height] duration-300"
          loading="eager"
        />
      </div>
    ) : (
      <a href={signupUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
        {t("newsletter.signup.openForm")}
      </a>
    )
  ) : (
    <div className="rounded-[1.25rem] border border-dashed border-ink/20 bg-paper/55 p-5 text-sm leading-6 text-charcoal/68">
      {t("newsletter.signup.missingConfig")}
    </div>
  );

  return (
    <article className={`surface rounded-[2rem] ${compact ? "p-5" : "p-6 sm:p-8"}`}>
      <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        {/* Left: what you'll get */}
        <div>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
              <Mail size={21} aria-hidden="true" />
            </div>
            <h2 className={`${compact ? "text-2xl" : "text-3xl sm:text-4xl"} leading-tight text-ink`}>
              {t("newsletter.signup.emailTitle", { brand: t("common.brand") })}
            </h2>
          </div>
          <p className="mt-4 max-w-md leading-7 text-charcoal/78">
            {t("newsletter.signup.emailCopy")}
          </p>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <li key={benefit.titleKey} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
                  <benefit.icon size={17} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-ink">{t(benefit.titleKey)}</span>
                  <span className="mt-1 block text-sm leading-6 text-charcoal/72">{t(benefit.copyKey)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: signup form */}
        <div className="w-full">{formColumn}</div>
      </div>
    </article>
  );
}

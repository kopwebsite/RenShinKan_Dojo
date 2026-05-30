import { Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";

type NewsletterSignupProps = {
  compact?: boolean;
  idPrefix?: string;
};

// Fallback height used until (or unless) the Brevo form reports its own height.
// Kept generous so the form is never clipped on mobile where fields stack taller.
const DEFAULT_FRAME_HEIGHT = 620;

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
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(DEFAULT_FRAME_HEIGHT);

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

  return (
    <article className={`surface rounded-[2rem] ${compact ? "p-5" : "p-6 sm:p-8"}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
        <Mail size={21} aria-hidden="true" />
      </div>
      <h2 className={`${compact ? "mt-3 text-2xl" : "mt-4 text-3xl sm:text-4xl"} text-ink`}>
        Get {t("common.brand")} updates by email.
      </h2>
      <p className="mt-4 leading-7 text-charcoal/78">
        Dojo news, gradings, workshops, and community events — straight to your inbox.
      </p>
      {signupUrl ? (
        canEmbed ? (
          <iframe
            ref={frameRef}
            id={`${idPrefix}-brevo-form`}
            title={`${t("common.brand")} newsletter signup`}
            src={signupUrl}
            scrolling="no"
            style={{ height: frameHeight }}
            className="mt-5 w-full rounded-[1.25rem] border border-ink/10 bg-paper transition-[height] duration-300"
            loading="lazy"
          />
        ) : (
          <a href={signupUrl} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5">
            Open signup form
          </a>
        )
      ) : (
        <div className="mt-5 rounded-[1.25rem] border border-dashed border-ink/20 bg-paper/55 p-5 text-sm leading-6 text-charcoal/68">
          Add VITE_BREVO_SIGNUP_FORM_URL to show the Brevo signup form.
        </div>
      )}
    </article>
  );
}

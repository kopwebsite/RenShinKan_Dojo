import { CalendarDays, Mail, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";

type NewsletterSignupProps = {
  compact?: boolean;
  idPrefix?: string;
};

// Fallback height used until (or unless) the Brevo form reports its own height.
// Tuned to hug the Brevo form content (email + captcha + button) with a small
// buffer. Mobile stacks taller, so the listener below grows it when needed.
const DEFAULT_FRAME_HEIGHT = 470;

const benefits = [
  {
    icon: CalendarDays,
    title: "Upcoming workshops",
    copy: "Seminar dates and visiting-instructor events before they fill up.",
  },
  {
    icon: Sparkles,
    title: "New class details",
    copy: "Schedule changes, new courses, and grading announcements.",
  },
  {
    icon: Users,
    title: "Dojo community",
    copy: "Stories from the mat, member milestones, and special gatherings.",
  },
  {
    icon: ShieldCheck,
    title: "No spam, ever",
    copy: "Only genuine dojo news. Unsubscribe in one click, anytime.",
  },
];

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

  const formColumn = signupUrl ? (
    canEmbed ? (
      <iframe
        ref={frameRef}
        id={`${idPrefix}-brevo-form`}
        title={`${t("common.brand")} newsletter signup`}
        src={signupUrl}
        scrolling="no"
        style={{ height: frameHeight }}
        className="block w-full rounded-[1rem] border border-ink/10 bg-paper transition-[height] duration-300"
        loading="lazy"
      />
    ) : (
      <a href={signupUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
        Open signup form
      </a>
    )
  ) : (
    <div className="rounded-[1.25rem] border border-dashed border-ink/20 bg-paper/55 p-5 text-sm leading-6 text-charcoal/68">
      Add VITE_BREVO_SIGNUP_FORM_URL to show the Brevo signup form.
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
              Get {t("common.brand")} updates by email.
            </h2>
          </div>
          <p className="mt-4 max-w-md leading-7 text-charcoal/78">
            Join the dojo mailing list and we'll keep you in the loop:
          </p>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <li key={benefit.title} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
                  <benefit.icon size={17} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-ink">{benefit.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-charcoal/72">{benefit.copy}</span>
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

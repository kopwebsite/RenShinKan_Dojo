import { Play } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";

type DeferredEmbedProps = {
  src: string;
  title: string;
  buttonLabel: string;
  className?: string;
  allow?: string;
  allowFullScreen?: boolean;
  referrerPolicy?: ComponentProps<"iframe">["referrerPolicy"];
};

export function DeferredEmbed({
  src,
  title,
  buttonLabel,
  className = "h-full w-full",
  allow,
  allowFullScreen,
  referrerPolicy,
}: DeferredEmbedProps) {
  const [active, setActive] = useState(false);

  if (active) {
    return (
      <iframe
        src={src}
        title={title}
        className={className}
        loading="lazy"
        allow={allow}
        allowFullScreen={allowFullScreen}
        referrerPolicy={referrerPolicy}
      />
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setActive(true)}
        className="flex h-full w-full flex-col items-center justify-center gap-3 bg-mist/70 p-6 text-center text-ink transition hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bamboo"
        aria-label={buttonLabel}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper shadow-soft">
          <Play size={22} fill="currentColor" aria-hidden="true" />
        </span>
        <span className="max-w-xs text-sm font-bold">{buttonLabel}</span>
      </button>
    </div>
  );
}

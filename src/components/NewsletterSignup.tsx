import { Facebook, Send } from "lucide-react";
import { siteInfo } from "../data/siteContent";

type NewsletterSignupProps = {
  compact?: boolean;
  idPrefix?: string;
};

export function NewsletterSignup({ compact = false }: NewsletterSignupProps) {
  return (
    <article className={`surface rounded-[2rem] ${compact ? "p-5" : "p-6 sm:p-8"}`}>
      <p className="eyebrow">Dojo Updates</p>
      <h2 className="mt-3 text-4xl text-ink">Follow RenshinKan updates.</h2>
      <p className="mt-4 leading-7 text-charcoal/78">
        Newsletter signup will be connected after a secure email provider is added.
        For now, follow or message the dojo on Facebook for class notes, event updates,
        and workshop announcements.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a
          href={siteInfo.facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          <Facebook size={18} aria-hidden="true" />
          Follow on Facebook
        </a>
        <a
          href={siteInfo.facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
        >
          <Send size={17} aria-hidden="true" />
          Message the Dojo
        </a>
      </div>
    </article>
  );
}

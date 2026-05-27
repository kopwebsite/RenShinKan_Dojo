import { Mail } from "lucide-react";

type NewsletterSignupProps = {
  compact?: boolean;
  idPrefix?: string;
};

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

export function NewsletterSignup({ compact = false, idPrefix = "newsletter" }: NewsletterSignupProps) {
  const signupUrl = getSignupUrl();
  const canEmbed = signupUrl.includes("sibforms.com");

  return (
    <article className={`surface rounded-[2rem] ${compact ? "p-5" : "p-6 sm:p-8"}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
        <Mail size={21} aria-hidden="true" />
      </div>
      <h2 className={`${compact ? "mt-3 text-2xl" : "mt-4 text-4xl"} text-ink`}>
        Get RenshinKan Dojo updates by email.
      </h2>
      <p className="mt-4 leading-7 text-charcoal/78">
        Brevo signup form embed goes here.
      </p>
      {signupUrl ? (
        canEmbed ? (
          <iframe
            id={`${idPrefix}-brevo-form`}
            title="RenshinKan Dojo newsletter signup"
            src={signupUrl}
            className="mt-5 h-80 w-full rounded-[1.25rem] border border-ink/10 bg-paper"
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

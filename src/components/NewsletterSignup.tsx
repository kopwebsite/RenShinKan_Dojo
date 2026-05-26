import { Send } from "lucide-react";
import { FormEvent, useState } from "react";

type NewsletterSignupProps = {
  compact?: boolean;
  idPrefix?: string;
};

type FormValues = {
  name: string;
  email: string;
  interest: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

const initialValues: FormValues = {
  name: "",
  email: "",
  interest: "",
};

export function NewsletterSignup({
  compact = false,
  idPrefix = "newsletter",
}: NewsletterSignupProps) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const fieldId = (field: keyof FormValues) => `${idPrefix}-${field}`;

  function validate(): FormErrors {
    const nextErrors: FormErrors = {};

    if (!values.name.trim()) {
      nextErrors.name = "Enter a parent or student name.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!values.interest) {
      nextErrors.interest = "Choose an interest area.";
    }

    return nextErrors;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitted(Object.keys(nextErrors).length === 0);
  }

  return (
    <form
      className={`surface rounded-[2rem] ${compact ? "p-5" : "p-6 sm:p-8"}`}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className={compact ? "grid gap-4" : "grid gap-5 md:grid-cols-2"}>
        <div>
          <label htmlFor={fieldId("name")} className="text-sm font-bold text-ink">
            Parent or student name
          </label>
          <input
            id={fieldId("name")}
            name="name"
            className="input-field"
            value={values.name}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
            aria-invalid={errors.name ? "true" : "false"}
            aria-describedby={errors.name ? `${fieldId("name")}-error` : undefined}
            autoComplete="name"
          />
          {errors.name ? (
            <p id={`${fieldId("name")}-error`} className="mt-2 text-sm text-vermilion">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={fieldId("email")} className="text-sm font-bold text-ink">
            Email
          </label>
          <input
            id={fieldId("email")}
            name="email"
            type="email"
            className="input-field"
            value={values.email}
            onChange={(event) =>
              setValues((current) => ({ ...current, email: event.target.value }))
            }
            aria-invalid={errors.email ? "true" : "false"}
            aria-describedby={errors.email ? `${fieldId("email")}-error` : undefined}
            autoComplete="email"
          />
          {errors.email ? (
            <p id={`${fieldId("email")}-error`} className="mt-2 text-sm text-vermilion">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div className={compact ? "" : "md:col-span-2"}>
          <label htmlFor={fieldId("interest")} className="text-sm font-bold text-ink">
            Interest area
          </label>
          <select
            id={fieldId("interest")}
            name="interest"
            className="input-field"
            value={values.interest}
            onChange={(event) =>
              setValues((current) => ({ ...current, interest: event.target.value }))
            }
            aria-invalid={errors.interest ? "true" : "false"}
            aria-describedby={
              errors.interest ? `${fieldId("interest")}-error` : undefined
            }
          >
            <option value="">Choose one</option>
            <option value="beginner">Beginner adult classes</option>
            <option value="children">Children and teens</option>
            <option value="visitor">Visiting aikidoka</option>
            <option value="workshops">Workshops and events</option>
            <option value="community">Peace culture and community</option>
          </select>
          {errors.interest ? (
            <p id={`${fieldId("interest")}-error`} className="mt-2 text-sm text-vermilion">
              {errors.interest}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="submit" className="btn-primary">
          <Send size={17} aria-hidden="true" />
          Subscribe
        </button>
        <p className="text-sm text-charcoal/65" aria-live="polite">
          {submitted
            ? "You are subscribed. We will be in touch with updates."
            : "We will not share your details with anyone."}
        </p>
      </div>
    </form>
  );
}

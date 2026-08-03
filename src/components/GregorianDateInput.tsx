import { useEffect, useId, useState, type InputHTMLAttributes } from "react";
import {
  canonicalDateTimeToDisplay,
  canonicalDateToDisplay,
  displayDateTimeToCanonical,
  displayDateToCanonical,
  displayMonthToCanonical,
  formatGregorianMonth,
} from "../../shared/date";
import { useAdminTranslation, useTranslation } from "../i18n";

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (canonicalValue: string) => void;
  admin?: boolean;
};

function useDateCopy(admin: boolean) {
  const publicTranslation = useTranslation();
  const adminTranslation = useAdminTranslation();
  return admin ? adminTranslation.t : publicTranslation.t;
}

function describedBy(input: string | undefined, helperId: string) {
  return [input, helperId].filter(Boolean).join(" ");
}

/** Display DD/MM/YYYY while preserving canonical API values (YYYY-MM-DD). */
export function GregorianDateInput({ value, onChange, admin = false, "aria-describedby": ariaDescribedBy, ...props }: BaseProps) {
  const t = useDateCopy(admin);
  const helperId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState(canonicalDateToDisplay(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setDraft(canonicalDateToDisplay(value)), [value]);
  return <>
    <input
      {...props}
      type="text"
      inputMode="numeric"
      lang="en-GB"
      placeholder="DD/MM/YYYY"
      pattern="(?:0[1-9]|[12][0-9]|3[01])\/(?:0[1-9]|1[0-2])\/[0-9]{4}"
      value={draft}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(ariaDescribedBy, `${helperId}${invalid ? ` ${errorId}` : ""}`)}
      onChange={(event) => {
        const next = event.target.value.replace(/[^0-9/]/g, "").slice(0, 10);
        setDraft(next);
        const canonical = displayDateToCanonical(next);
        setInvalid(Boolean(next) && next.length === 10 && !canonical);
        onChange(canonical || "");
      }}
      onBlur={() => setInvalid(Boolean(draft) && !displayDateToCanonical(draft))}
    />
    <small id={helperId} className="gregorian-date-help">{t("date.gregorianHelp")}</small>
    {invalid ? <small id={errorId} className="gregorian-date-error" role="alert">Enter a valid date as DD/MM/YYYY.</small> : null}
  </>;
}

export function GregorianMonthInput({
  value,
  onChange,
  admin = false,
  "aria-describedby": ariaDescribedBy,
  id,
  name,
  required,
  disabled,
  autoFocus,
  ...props
}: BaseProps) {
  const t = useDateCopy(admin);
  const helperId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState(formatGregorianMonth(value, ""));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setDraft(formatGregorianMonth(value, "")), [value]);

  return <>
    <input
      {...props}
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      placeholder="MM/YYYY"
      pattern="(?:0[1-9]|1[0-2])\/[0-9]{4}"
      value={draft}
      required={required}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-invalid={invalid || undefined}
      aria-describedby={[ariaDescribedBy, helperId, invalid ? errorId : ""].filter(Boolean).join(" ")}
      onChange={(event) => {
        const next = event.target.value.replace(/[^0-9/]/g, "").slice(0, 7);
        setDraft(next);
        const canonical = displayMonthToCanonical(next);
        setInvalid(Boolean(next) && next.length === 7 && !canonical);
        onChange(canonical || "");
      }}
      onBlur={() => setInvalid(Boolean(draft) && !displayMonthToCanonical(draft))}
    />
    <small id={helperId} className="gregorian-date-help">{t("date.monthHelp")}</small>
    {invalid ? <small id={errorId} className="gregorian-date-error" role="alert">Enter a valid month as MM/YYYY.</small> : null}
  </>;
}

export function GregorianDateTimeInput({ value, onChange, admin = false, "aria-describedby": ariaDescribedBy, ...props }: BaseProps) {
  const t = useDateCopy(admin);
  const helperId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState(canonicalDateTimeToDisplay(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setDraft(canonicalDateTimeToDisplay(value)), [value]);
  return <>
    <input
      {...props}
      type="text"
      inputMode="numeric"
      lang="en-GB"
      placeholder="DD/MM/YYYY HH:MM"
      pattern="(?:0[1-9]|[12][0-9]|3[01])\/(?:0[1-9]|1[0-2])\/[0-9]{4} (?:[01][0-9]|2[0-3]):[0-5][0-9]"
      value={draft}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(ariaDescribedBy, `${helperId}${invalid ? ` ${errorId}` : ""}`)}
      onChange={(event) => {
        const next = event.target.value.replace(/[^0-9/: ]/g, "").slice(0, 16);
        setDraft(next);
        const canonical = displayDateTimeToCanonical(next);
        setInvalid(Boolean(next) && next.length === 16 && !canonical);
        onChange(canonical || "");
      }}
      onBlur={() => setInvalid(Boolean(draft) && !displayDateTimeToCanonical(draft))}
    />
    <small id={helperId} className="gregorian-date-help">{t("date.dateTimeHelp")}</small>
    {invalid ? <small id={errorId} className="gregorian-date-error" role="alert">Enter a valid date and time as DD/MM/YYYY HH:MM.</small> : null}
  </>;
}

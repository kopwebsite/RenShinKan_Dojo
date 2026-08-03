import { CalendarDays } from "lucide-react";
import { useEffect, useId, useState, type InputHTMLAttributes } from "react";
import {
  canonicalDateTimeToDisplay,
  canonicalDateToDisplay,
  displayDateTimeToCanonical,
  displayDateToCanonical,
  displayMonthToCanonical,
  formatDisplayDateInput,
  formatDisplayDateTimeInput,
  formatDisplayMonthInput,
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

function CalendarPicker({
  type,
  value,
  disabled,
  min,
  max,
  onChange,
}: {
  type: "date" | "month" | "datetime-local";
  value: string;
  disabled?: boolean;
  min?: string | number;
  max?: string | number;
  onChange: (value: string) => void;
}) {
  const label = type === "month" ? "Choose month from calendar" : type === "datetime-local" ? "Choose date and time from calendar" : "Choose date from calendar";
  return <span className="gregorian-date-picker" aria-hidden={disabled || undefined}>
    <CalendarDays size={18} aria-hidden="true" />
    <input
      type={type}
      value={value}
      disabled={disabled}
      min={typeof min === "string" || typeof min === "number" ? min : undefined}
      max={typeof max === "string" || typeof max === "number" ? max : undefined}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    />
  </span>;
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
    <span className="gregorian-date-control">
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
          const next = formatDisplayDateInput(event.target.value);
          setDraft(next);
          const canonical = displayDateToCanonical(next);
          setInvalid(Boolean(next) && next.length === 10 && !canonical);
          onChange(canonical || "");
        }}
        onBlur={() => setInvalid(Boolean(draft) && !displayDateToCanonical(draft))}
      />
      <CalendarPicker type="date" value={value} disabled={props.disabled} min={props.min} max={props.max} onChange={(next) => { setDraft(canonicalDateToDisplay(next)); setInvalid(false); onChange(next); }} />
    </span>
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
    <span className="gregorian-date-control">
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
          const next = formatDisplayMonthInput(event.target.value);
          setDraft(next);
          const canonical = displayMonthToCanonical(next);
          setInvalid(Boolean(next) && next.length === 7 && !canonical);
          onChange(canonical || "");
        }}
        onBlur={() => setInvalid(Boolean(draft) && !displayMonthToCanonical(draft))}
      />
      <CalendarPicker type="month" value={value} disabled={disabled} min={props.min} max={props.max} onChange={(next) => { setDraft(formatGregorianMonth(next, "")); setInvalid(false); onChange(next); }} />
    </span>
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
    <span className="gregorian-date-control">
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
          const next = formatDisplayDateTimeInput(event.target.value);
          setDraft(next);
          const canonical = displayDateTimeToCanonical(next);
          setInvalid(Boolean(next) && next.length === 16 && !canonical);
          onChange(canonical || "");
        }}
        onBlur={() => setInvalid(Boolean(draft) && !displayDateTimeToCanonical(draft))}
      />
      <CalendarPicker type="datetime-local" value={value} disabled={props.disabled} min={props.min} max={props.max} onChange={(next) => { setDraft(canonicalDateTimeToDisplay(next)); setInvalid(false); onChange(next); }} />
    </span>
    <small id={helperId} className="gregorian-date-help">{t("date.dateTimeHelp")}</small>
    {invalid ? <small id={errorId} className="gregorian-date-error" role="alert">Enter a valid date and time as DD/MM/YYYY HH:MM.</small> : null}
  </>;
}

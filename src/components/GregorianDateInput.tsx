import { CalendarDays } from "lucide-react";
import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
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

function useDraft(value: string, toDisplay: (value: string) => string) {
  const [draft, setDraft] = useState(() => toDisplay(value));
  const locallyEmittedValue = useRef(value);
  useEffect(() => {
    if (value !== locallyEmittedValue.current) setDraft(toDisplay(value));
    locallyEmittedValue.current = value;
  }, [toDisplay, value]);
  return [draft, setDraft, locallyEmittedValue] as const;
}

function canonicalMonthToDisplay(value: string) {
  return formatGregorianMonth(value, "");
}

function describedBy(input: string | undefined, helperId: string, errorId: string, invalid: boolean) {
  return [input, helperId, invalid ? errorId : ""].filter(Boolean).join(" ");
}

export function GregorianDateInput({ value, onChange, admin = false, "aria-describedby": ariaDescribedBy, ...props }: BaseProps) {
  const t = useDateCopy(admin);
  const helperId = useId();
  const errorId = useId();
  const [draft, setDraft, locallyEmittedValue] = useDraft(value, canonicalDateToDisplay);
  const invalid = Boolean(draft && !displayDateToCanonical(draft));
  const pickerRef = useRef<HTMLInputElement>(null);

  return <>
    <span className="gregorian-date-control">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete={props.autoComplete || "off"}
        placeholder="DD/MM/YYYY"
        pattern="\d{2}/\d{2}/\d{4}"
        value={draft}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(ariaDescribedBy, helperId, errorId, invalid)}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d/]/g, "").slice(0, 10);
          setDraft(next);
          const canonical = displayDateToCanonical(next);
          locallyEmittedValue.current = canonical || "";
          onChange(canonical || "");
        }}
      />
      <button type="button" aria-label={t("date.openCalendar")} onClick={() => {
        const picker = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
        if (picker?.showPicker) picker.showPicker(); else picker?.click();
      }}><CalendarDays aria-hidden="true" /></button>
      <input ref={pickerRef} className="gregorian-native-picker" type="date" value={value} tabIndex={-1} aria-hidden="true"
        onChange={(event) => onChange(event.target.value)} />
    </span>
    <small id={helperId} className="gregorian-date-help">{t("date.gregorianHelp")}</small>
    {invalid ? <small id={errorId} className="form-error gregorian-date-error">{t("date.invalid")}</small> : null}
  </>;
}

export function GregorianMonthInput({ value, onChange, admin = false, "aria-describedby": ariaDescribedBy, ...props }: BaseProps) {
  const t = useDateCopy(admin);
  const helperId = useId();
  const errorId = useId();
  const [draft, setDraft, locallyEmittedValue] = useDraft(value, canonicalMonthToDisplay);
  const invalid = Boolean(draft && !displayMonthToCanonical(draft));
  const pickerRef = useRef<HTMLInputElement>(null);

  return <>
    <span className="gregorian-date-control">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete={props.autoComplete || "off"}
        placeholder="MM/YYYY"
        pattern="\d{2}/\d{4}"
        value={draft}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(ariaDescribedBy, helperId, errorId, invalid)}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d/]/g, "").slice(0, 7);
          setDraft(next);
          const canonical = displayMonthToCanonical(next);
          locallyEmittedValue.current = canonical || "";
          onChange(canonical || "");
        }}
      />
      <button type="button" aria-label={t("date.openMonthPicker")} onClick={() => {
        const picker = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
        if (picker?.showPicker) picker.showPicker(); else picker?.click();
      }}><CalendarDays aria-hidden="true" /></button>
      <input ref={pickerRef} className="gregorian-native-picker" type="month" value={value} tabIndex={-1} aria-hidden="true"
        onChange={(event) => onChange(event.target.value)} />
    </span>
    <small id={helperId} className="gregorian-date-help">{t("date.monthHelp")}</small>
    {invalid ? <small id={errorId} className="form-error gregorian-date-error">{t("date.invalidMonth")}</small> : null}
  </>;
}

export function GregorianDateTimeInput({ value, onChange, admin = false, "aria-describedby": ariaDescribedBy, ...props }: BaseProps) {
  const t = useDateCopy(admin);
  const helperId = useId();
  const errorId = useId();
  const [draft, setDraft, locallyEmittedValue] = useDraft(value, canonicalDateTimeToDisplay);
  const invalid = Boolean(draft && !displayDateTimeToCanonical(draft));
  const pickerRef = useRef<HTMLInputElement>(null);

  return <>
    <span className="gregorian-date-control">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete={props.autoComplete || "off"}
        placeholder="DD/MM/YYYY HH:mm"
        pattern="\d{2}/\d{2}/\d{4} \d{2}:\d{2}"
        value={draft}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(ariaDescribedBy, helperId, errorId, invalid)}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d/ :]/g, "").slice(0, 16);
          setDraft(next);
          const canonical = displayDateTimeToCanonical(next);
          locallyEmittedValue.current = canonical || "";
          onChange(canonical || "");
        }}
      />
      <button type="button" aria-label={t("date.openDateTimePicker")} onClick={() => {
        const picker = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
        if (picker?.showPicker) picker.showPicker(); else picker?.click();
      }}><CalendarDays aria-hidden="true" /></button>
      <input ref={pickerRef} className="gregorian-native-picker" type="datetime-local" value={value} tabIndex={-1} aria-hidden="true"
        onChange={(event) => onChange(event.target.value)} />
    </span>
    <small id={helperId} className="gregorian-date-help">{t("date.dateTimeHelp")}</small>
    {invalid ? <small id={errorId} className="form-error gregorian-date-error">{t("date.invalidDateTime")}</small> : null}
  </>;
}

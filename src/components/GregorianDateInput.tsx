import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { isMonthKey } from "../../shared/date";
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

/**
 * Browser-native date fields keep the submitted value canonical (YYYY-MM-DD)
 * while providing a keyboard and touch accessible calendar. Setting an
 * explicit Gregorian locale prevents the Thai Buddhist year from appearing in
 * the picker even when the surrounding page is Thai.
 */
export function GregorianDateInput({ value, onChange, admin = false, "aria-describedby": ariaDescribedBy, ...props }: BaseProps) {
  const t = useDateCopy(admin);
  const helperId = useId();
  return <>
    <input
      {...props}
      type="date"
      lang="en-GB-u-ca-gregory-nu-latn"
      value={value}
      aria-describedby={describedBy(ariaDescribedBy, helperId)}
      onChange={(event) => onChange(event.target.value)}
    />
    <small id={helperId} className="gregorian-date-help">{t("date.gregorianHelp")}</small>
  </>;
}

const GREGORIAN_MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

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
  const controlId = useId();
  const validValue = isMonthKey(value) ? value : "";
  const [canonicalYear = "", canonicalMonth = ""] = validValue.split("-");
  const [draftYear, setDraftYear] = useState(canonicalYear);
  const [draftMonth, setDraftMonth] = useState(canonicalMonth);
  const currentYear = new Date().getFullYear();
  const maximumYear = currentYear + 10;
  const monthLabelId = useId();
  const yearLabelId = useId();
  const errorId = useId();
  const lastEmittedValue = useRef<string | null>(null);
  const validDraftYear = /^\d{4}$/.test(draftYear) && Number(draftYear) >= 1900 && Number(draftYear) <= maximumYear;
  const validationMessage = draftMonth && !draftYear
    ? t("date.yearMissing")
    : draftYear && !draftMonth
      ? t("date.monthMissing")
      : draftYear && !validDraftYear
        ? t("date.yearRange", { minimum: 1900, maximum: maximumYear })
        : "";
  useEffect(() => {
    if (lastEmittedValue.current === validValue) {
      lastEmittedValue.current = null;
      return;
    }
    setDraftYear(canonicalYear);
    setDraftMonth(canonicalMonth);
  }, [canonicalMonth, canonicalYear, validValue]);
  const changePart = (nextYear: string, nextMonth: string) => {
    const yearNumber = Number(nextYear);
    const validYear = /^\d{4}$/.test(nextYear) && yearNumber >= 1900 && yearNumber <= maximumYear;
    const nextValue = validYear && nextMonth ? `${nextYear}-${nextMonth}` : "";
    lastEmittedValue.current = nextValue;
    onChange(nextValue);
  };

  return <>
    <span
      className={`gregorian-month-control${props.className ? ` ${props.className}` : ""}`}
      role="group"
      aria-describedby={[ariaDescribedBy, helperId, validationMessage ? errorId : ""].filter(Boolean).join(" ")}
    >
      <span className="gregorian-month-part">
        <span id={monthLabelId}>{t("date.monthLabel")}</span>
        <select
          id={id || `${controlId}-month`}
          value={draftMonth}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-labelledby={monthLabelId}
          aria-invalid={Boolean(draftYear && !draftMonth) || undefined}
          onChange={(event) => { setDraftMonth(event.target.value); changePart(draftYear, event.target.value); }}
        >
          <option value="">{t("date.chooseMonth")}</option>
          {GREGORIAN_MONTHS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </span>
      <span className="gregorian-month-part">
        <span id={yearLabelId}>{t("date.yearLabel")}</span>
        <input
          id={`${controlId}-year`}
          type="number"
          inputMode="numeric"
          min={1900}
          max={maximumYear}
          step={1}
          placeholder={t("date.yearPlaceholder")}
          value={draftYear}
          required={required}
          disabled={disabled}
          aria-labelledby={yearLabelId}
          aria-invalid={Boolean(draftYear && !validDraftYear) || undefined}
          onChange={(event) => {
            const nextYear = event.target.value.replace(/\D/g, "").slice(0, 4);
            setDraftYear(nextYear);
            changePart(nextYear, draftMonth);
          }}
        />
      </span>
      {name ? <input type="hidden" name={name} value={validValue} /> : null}
    </span>
    <small id={helperId} className="gregorian-date-help">{t("date.monthHelp")}</small>
    {validationMessage ? <small id={errorId} className="gregorian-date-error" role="alert">{validationMessage}</small> : null}
  </>;
}

export function GregorianDateTimeInput({ value, onChange, admin = false, "aria-describedby": ariaDescribedBy, ...props }: BaseProps) {
  const t = useDateCopy(admin);
  const helperId = useId();
  return <>
    <input
      {...props}
      type="datetime-local"
      lang="en-GB-u-ca-gregory-nu-latn"
      value={value}
      aria-describedby={describedBy(ariaDescribedBy, helperId)}
      onChange={(event) => onChange(event.target.value)}
    />
    <small id={helperId} className="gregorian-date-help">{t("date.dateTimeHelp")}</small>
  </>;
}

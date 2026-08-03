export const CANONICAL_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const DISPLAY_DATE_PATTERN = /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(\d{4})$/;
export const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DISPLAY_MONTH_PATTERN = /^(0[1-9]|1[0-2])\/(\d{4})$/;
export const CANONICAL_LOCAL_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;
export const DISPLAY_DATE_TIME_PATTERN = /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(\d{4}) ([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const GREGORIAN_LOCALE = "en-GB-u-ca-gregory-nu-latn";

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isCanonicalDate(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return year >= 1 && year <= 9999 && day <= daysInMonth(year, month);
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && MONTH_KEY_PATTERN.test(value);
}

export function displayDateToCanonical(value: string) {
  const match = DISPLAY_DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const canonical = `${match[3]}-${match[2]}-${match[1]}`;
  return isCanonicalDate(canonical) ? canonical : null;
}

function inputDigits(value: string, limit: number) {
  return value.replace(/\D/g, "").slice(0, limit);
}

/** Formats a numeric date draft as DD/MM/YYYY while the user types. */
export function formatDisplayDateInput(value: string) {
  const digits = inputDigits(value, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Formats a numeric month draft as MM/YYYY while the user types. */
export function formatDisplayMonthInput(value: string) {
  const digits = inputDigits(value, 6);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Formats a numeric local date/time draft as DD/MM/YYYY HH:MM. */
export function formatDisplayDateTimeInput(value: string) {
  const digits = inputDigits(value, 12);
  const date = formatDisplayDateInput(digits.slice(0, 8));
  if (digits.length <= 8) return date;
  const time = digits.slice(8);
  return `${date} ${time.length <= 2 ? time : `${time.slice(0, 2)}:${time.slice(2)}`}`;
}

export function canonicalDateToDisplay(value: unknown) {
  if (!isCanonicalDate(value)) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function normalizeCanonicalDate(value: unknown) {
  if (isCanonicalDate(value)) return value;
  return typeof value === "string" ? displayDateToCanonical(value) : null;
}

function validTimestamp(value: unknown) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function bangkokParts(value: Date) {
  const parts = new Intl.DateTimeFormat(GREGORIAN_LOCALE, {
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || "";
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute") };
}

export function formatGregorianDate(value: unknown, fallback = "Not recorded") {
  if (isCanonicalDate(value)) return canonicalDateToDisplay(value);
  const timestamp = validTimestamp(value);
  if (!timestamp) return fallback;
  const parts = bangkokParts(timestamp);
  return `${parts.day}/${parts.month}/${parts.year}`;
}

export function formatGregorianDateTime(value: unknown, fallback = "Not recorded") {
  const localDateTime = canonicalDateTimeToDisplay(value);
  if (localDateTime) return localDateTime;
  const timestamp = validTimestamp(value);
  if (!timestamp) return isCanonicalDate(value) ? `${canonicalDateToDisplay(value)} 00:00` : fallback;
  const parts = bangkokParts(timestamp);
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

export function formatGregorianMonth(value: unknown, fallback = "Not recorded") {
  if (!isMonthKey(value)) return fallback;
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

export function displayMonthToCanonical(value: string) {
  const match = DISPLAY_MONTH_PATTERN.exec(value.trim());
  return match ? `${match[2]}-${match[1]}` : null;
}

export function canonicalDateTimeToDisplay(value: unknown) {
  if (typeof value !== "string") return "";
  const match = CANONICAL_LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match || !isCanonicalDate(match[1])) return "";
  return `${canonicalDateToDisplay(match[1])} ${match[2]}:${match[3]}`;
}

export function displayDateTimeToCanonical(value: string) {
  const match = DISPLAY_DATE_TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  return isCanonicalDate(date) ? `${date}T${match[4]}:${match[5]}` : null;
}

export function bangkokCanonicalDate(value = new Date()) {
  if (!Number.isFinite(value.getTime())) throw new Error("A valid date is required.");
  const parts = bangkokParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function bangkokGregorianYear(value = new Date()) {
  return Number(bangkokCanonicalDate(value).slice(0, 4));
}

export function bangkokBuddhistYear(value = new Date()) {
  return bangkokGregorianYear(value) + 543;
}

export function currentBangkokMonthKey(value = new Date()) {
  return bangkokCanonicalDate(value).slice(0, 7);
}

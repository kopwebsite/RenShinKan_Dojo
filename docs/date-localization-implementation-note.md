# Gregorian dates and localization implementation note

Date: 27 July 2026

## Primary-source findings

- Native HTML `date` controls always submit `YYYY-MM-DD`, but their visible
  order and picker UI are browser/operating-system dependent. A native control
  therefore cannot guarantee the required visible `DD/MM/YYYY` Gregorian
  presentation. See [MDN: `<input type="date">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/date)
  and [MDN: HTML date and time formats](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Date_and_time_formats).
- `Intl.DateTimeFormat` accepts explicit `calendar` and `numberingSystem`
  options; both defaults are locale dependent. See
  [MDN: `Intl.DateTimeFormat()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat)
  and [ECMA-402](https://tc39.es/ecma402/).
- Unicode CLDR lists Buddhist before Gregorian in Thailand's calendar
  preference, so Thai formatting must never rely on an implicit locale
  default. See [UTS #35, Dates](https://unicode.org/reports/tr35/tr35-dates.html).
- Accessible forms need an explicit label, visible format instructions,
  keyboard-operable controls, and programmatically associated validation
  feedback. See the [W3C WAI Forms Tutorial](https://www.w3.org/WAI/tutorials/forms/),
  [G89: expected format and example](https://www.w3.org/WAI/WCAG21/Techniques/general/G89),
  and [WCAG 3.3.2 guidance](https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions.html).

## Chosen approach

1. Keep complete date-only values in canonical `YYYY-MM-DD` form in D1, APIs,
   and application state. Keep timestamps as ISO/UTC values.
2. Add shared, dependency-free date utilities that:
   - validate real Gregorian dates without ambiguous JavaScript parsing;
   - strictly parse `DD/MM/YYYY`;
   - round-trip canonical dates;
   - format complete dates as Latin-digit `DD/MM/YYYY` in every language;
   - format relevant timestamps as `DD/MM/YYYY HH:mm`, explicitly using
     `calendar: "gregory"`, `numberingSystem: "latn"`, and
     `timeZone: "Asia/Bangkok"`;
   - preserve genuine month/year, year-only, and approximate historical
     precision.
3. Replace visible native date/month inputs with accessible text controls using
   `DD/MM/YYYY` or `MM/YYYY`, strict validation, `inputMode="numeric"`,
   visible examples, `aria-describedby`, and localized Gregorian-calendar help.
   No large picker dependency is needed.
4. Remove `profileBio`/`profile_bio` from active forms, DTOs, mappings,
   responses, exports, and tests. Keep the already-applied
   `students.profile_bio` column dormant so migration replay and historical
   data remain intact; no values will be read, returned, accepted, or updated.
5. Preserve every existing student ID. Add a new forward-only Gregorian
   sequence table for newly generated IDs because the historical
   `dojo_student_year_sequences.buddhist_year` constraint cannot safely store
   Gregorian years. Historical migration `0011` and its table remain unchanged.
6. Keep public language preference (`en`, `th`, `zh-CN`, `ja`) separate from a
   persisted admin preference (`en`, `th`). Language values are allowlisted and
   never participate in authorization.

## Existing data inventory and migration safety

- Complete date-only fields are stored as canonical text across students,
  training hours, examinations, AAT payments, monthly contributions, payment
  proofs, newsletters, and galleries. Timestamps are stored as ISO text.
- Historical page content includes legitimate month/year and year-only labels;
  those will retain their original precision.
- Production migrations `0001` through `0019` are already applied and will not
  be rerun manually.
- The legacy `profile_bio` column will not be dropped or cleared.
- Existing student identifiers will not be rewritten.
- A new additive Gregorian-sequence migration is required; it will create a
  separate table and will not alter existing student, payment, examination,
  contribution, share-token, gallery, or newsletter records.

# Translation Fallback Tracking

English is the source language. The current Thai, Simplified Chinese, and Japanese dictionaries cover the shared shell, navigation, home page, classes, contact, newsletter basics, instructor intro, accessibility labels, and SEO metadata.

The following content intentionally falls back to English in this first pass:

- Long data-driven content in `src/data/siteContent.ts`, including Aikido history sections, instructor biographies, FAQ answers, workshop descriptions, community organisation descriptions, CMU history, related dojo descriptions, and historical photo captions.
- Editable/update content in `src/data/editableContent.ts`, including dojo updates, galleries, exam announcement text, and generated media alt text.
- Most admin editor copy in `src/pages/AdminPage.tsx`.
- Some secondary Support, Community, Workshops, and Aikido page copy where the Thai, Chinese, or Japanese dictionary does not yet contain a localized value.

Future localization should add structured localized fields for data-driven content instead of translating user-editable text dynamically in the browser.

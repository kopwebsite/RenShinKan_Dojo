# Translation Fallback Tracking

English is the source language. The Thai, Simplified Chinese, and Japanese dictionaries now mirror the English public UI dictionary key-for-key, including the shared shell, navigation, home page, Aikido, classes, workshops, community, support, contact, newsletter, instructor intro, accessibility labels, and SEO metadata.

The following content intentionally falls back to English in this first pass:

- Long data-driven content in `src/data/siteContent.ts`, including Aikido history sections, instructor biographies, FAQ answers, workshop descriptions, community organisation descriptions, CMU history, related dojo descriptions, and historical photo captions.
- Editable/update content in `src/data/editableContent.ts`, including dojo updates, galleries, exam announcement text, and generated media alt text. Newsletter/update cards now include Google Translate links so readers can translate individual newsletter text on demand.
- Most admin editor copy in `src/pages/AdminPage.tsx`.

Future localization should add structured localized fields for data-driven content instead of translating user-editable text dynamically in the browser.

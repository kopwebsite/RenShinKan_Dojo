import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const locales = ["en", "th", "ja", "zh-CN"] as const;

function dictionary(locale: (typeof locales)[number]) {
  return JSON.parse(
    readFileSync(resolve(`src/i18n/${locale}.json`), "utf8"),
  ) as unknown;
}

function leafEntries(value: unknown, path = ""): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      leafEntries(entry, `${path}[${index}]`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) =>
      leafEntries(entry, path ? `${path}.${key}` : key),
    );
  }
  return [[path, value]];
}

describe("translation completeness", () => {
  it("keeps the complete dictionary shape and non-empty copy in all public locales", () => {
    const dictionaries = Object.fromEntries(
      locales.map((locale) => [locale, leafEntries(dictionary(locale))]),
    ) as Record<(typeof locales)[number], Array<[string, unknown]>>;
    const expectedPaths = dictionaries.en.map(([path]) => path).sort();

    for (const locale of locales) {
      const entries = dictionaries[locale];
      expect(entries.map(([path]) => path).sort()).toEqual(expectedPaths);
      expect(
        entries.filter(
          ([, value]) => typeof value === "string" && value.trim().length === 0,
        ),
      ).toEqual([]);
    }
  });
});

import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "./en.json";

export type Language = "en" | "th" | "zh-CN" | "ja";

export type LanguageOption = {
  code: Language;
  label: string;
  nativeLabel: string;
  shortLabel: string;
};

type Primitive = string | number | boolean | null;
type Dictionary = typeof en;
type PartialDictionary = {
  [Key in keyof Dictionary]?: Dictionary[Key] extends Primitive
    ? Dictionary[Key]
    : Dictionary[Key] extends Array<infer Item>
      ? Item[]
      : PartialDictionaryOf<Dictionary[Key]>;
};
type PartialDictionaryOf<T> = {
  [Key in keyof T]?: T[Key] extends Primitive
    ? T[Key]
    : T[Key] extends Array<infer Item>
      ? Item[]
      : PartialDictionaryOf<T[Key]>;
};

type Join<Head extends string, Tail extends string> = `${Head}.${Tail}`;
type TranslationPath<T> = {
  [Key in keyof T & string]: T[Key] extends Primitive
    ? Key
    : T[Key] extends Array<unknown>
      ? Key
      : Key | Join<Key, TranslationPath<T[Key]>>;
}[keyof T & string];

export type TranslationKey = TranslationPath<Dictionary>;

type TranslationParams = Record<string, string | number>;

export const languageOptions: LanguageOption[] = [
  { code: "en", label: "English", nativeLabel: "English", shortLabel: "EN" },
  { code: "th", label: "Thai", nativeLabel: "ไทย", shortLabel: "TH" },
  { code: "zh-CN", label: "Chinese", nativeLabel: "中文", shortLabel: "中文" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語", shortLabel: "日本語" },
];

export const htmlLangMap: Record<Language, string> = {
  en: "en",
  th: "th",
  "zh-CN": "zh-CN",
  ja: "ja",
};

const loadedDictionaries: Partial<Record<Language, Dictionary | PartialDictionary>> = {
  en,
};

const dictionaryLoaders: Record<Exclude<Language, "en">, () => Promise<Dictionary | PartialDictionary>> = {
  th: () => import("./th.json").then((module) => module.default),
  "zh-CN": () => import("./zh-CN.json").then((module) => module.default),
  ja: () => import("./ja.json").then((module) => module.default),
};

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key) => key,
});

function normalizeLanguage(value: string | null): Language {
  if (value === "zh") {
    return "zh-CN";
  }

  if (value === "en" || value === "th" || value === "zh-CN" || value === "ja") {
    return value;
  }

  return "en";
}

function getSavedLanguage(): Language {
  try {
    return normalizeLanguage(localStorage.getItem("rsk-lang"));
  } catch {
    return "en";
  }
}

function getValue(dictionary: Dictionary | PartialDictionary, key: TranslationKey) {
  return key
    .split(".")
    .reduce<unknown>((current, part) => {
      if (!current || typeof current !== "object") {
        return undefined;
      }

      return (current as Record<string, unknown>)[part];
    }, dictionary);
}

async function loadDictionary(language: Language) {
  if (loadedDictionaries[language]) {
    return loadedDictionaries[language];
  }

  if (language === "en") {
    return en;
  }

  const dictionary = await dictionaryLoaders[language]();
  loadedDictionaries[language] = dictionary;
  return dictionary;
}

function formatTranslation(value: string, params?: TranslationParams) {
  if (!params) {
    return value;
  }

  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    params[name] === undefined ? `{{${name}}}` : String(params[name]),
  );
}

export function translate(language: Language, key: TranslationKey, params?: TranslationParams) {
  const localizedDictionary = loadedDictionaries[language] ?? en;
  const localized = getValue(localizedDictionary, key);
  const fallback = getValue(en, key);
  const value = typeof localized === "string" ? localized : typeof fallback === "string" ? fallback : key;

  return formatTranslation(value, params);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getSavedLanguage);
  const [dictionaryVersion, setDictionaryVersion] = useState(0);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    void loadDictionary(lang).then(() => setDictionaryVersion((version) => version + 1));

    try {
      localStorage.setItem("rsk-lang", lang);
    } catch {
      // Local storage can be unavailable in private contexts.
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    loadDictionary(language)
      .then(() => {
        if (!ignore) {
          setDictionaryVersion((version) => version + 1);
        }
      })
      .catch(() => {
        // The English dictionary stays available as a safe fallback.
      });

    return () => {
      ignore = true;
    };
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = htmlLangMap[language];
    document.documentElement.dataset.language = language;
  }, [language]);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language, dictionaryVersion],
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
    }),
    [language, setLanguage, t],
  );

  return createElement(LanguageContext.Provider, { value }, children);
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useTranslation() {
  return useLanguage();
}

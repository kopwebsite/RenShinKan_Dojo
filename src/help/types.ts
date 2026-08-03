export type HelpAudience = "public" | "admin";
export type HelpLocale = "en" | "th" | "ja" | "zh-CN";
export type HelpCategory =
  | "getting-started"
  | "student-records"
  | "training"
  | "examinations"
  | "payments"
  | "news-resources"
  | "support"
  | "administration";

export type HelpStep = {
  title: string;
  instruction: string;
  result: string;
};

export type HelpTroubleshooting = {
  issue: string;
  fix: string;
};

export type HelpScreenshot = {
  src: string;
  alt: string;
  caption: string;
};

export type HelpArticle = {
  id: string;
  audience: HelpAudience;
  routes: string[];
  category: HelpCategory;
  title: string;
  summary: string;
  steps: HelpStep[];
  troubleshooting: HelpTroubleshooting[];
  related: string[];
  screenshots: HelpScreenshot[];
  keywords: string[];
  action: { label: string; href: string };
  locale: HelpLocale;
  version: string;
};

export type HelpUiCopy = {
  trigger: string;
  triggerAriaLabel: string;
  heading: string;
  guideDescription: string;
  close: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchStatus: (count: number) => string;
  suggested: string;
  allTopics: string;
  categories: Record<HelpCategory, string>;
  back: string;
  breadcrumb: string;
  steps: string;
  expectedResult: string;
  troubleshooting: string;
  related: string;
  noResults: string;
  resetSearch: string;
  imageUnavailable: string;
  copied: string;
  copyLink: string;
  smallerText: string;
  largerText: string;
  loading: string;
  contentUnavailable: string;
  retry: string;
};

export type HelpCatalog = {
  audience: HelpAudience;
  locale: HelpLocale;
  ui: HelpUiCopy;
  articles: HelpArticle[];
};

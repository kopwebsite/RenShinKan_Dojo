import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { siteInfo } from "../data/siteContent";
import { htmlLangMap, useTranslation, type Language, type TranslationKey } from "../i18n";

const SITE_URL = "https://crappytaco.github.io/RenShinKan_Dojo";
const DEFAULT_IMAGE = `${SITE_URL}/dojo-photos/aikido-hero-new.png`;

type SeoConfig = {
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  path: string;
  robots?: string;
};

const ogLocaleByLanguage: Record<Language, string> = {
  en: "en_US",
  th: "th_TH",
  "zh-CN": "zh_CN",
  ja: "ja_JP",
};

const seoByPath: Record<string, SeoConfig> = {
  "/": {
    titleKey: "seo.homeTitle",
    descriptionKey: "seo.homeDescription",
    path: "/",
  },
  "/aikido": {
    titleKey: "seo.aikidoTitle",
    descriptionKey: "seo.aikidoDescription",
    path: "/aikido",
  },
  "/classes": {
    titleKey: "seo.classesTitle",
    descriptionKey: "seo.classesDescription",
    path: "/classes",
  },
  "/workshops": {
    titleKey: "seo.workshopsTitle",
    descriptionKey: "seo.workshopsDescription",
    path: "/workshops",
  },
  "/newsletter": {
    titleKey: "seo.newsletterTitle",
    descriptionKey: "seo.newsletterDescription",
    path: "/newsletter",
  },
  "/community": {
    titleKey: "seo.communityTitle",
    descriptionKey: "seo.communityDescription",
    path: "/community",
  },
  "/support": {
    titleKey: "seo.supportTitle",
    descriptionKey: "seo.supportDescription",
    path: "/support",
  },
  "/contact": {
    titleKey: "seo.contactTitle",
    descriptionKey: "seo.contactDescription",
    path: "/contact",
  },
  "/visit": {
    titleKey: "seo.visitTitle",
    descriptionKey: "seo.visitDescription",
    path: "/visit",
  },
  "/admin": {
    titleKey: "seo.adminTitle",
    descriptionKey: "seo.adminDescription",
    path: "/admin",
    robots: "noindex,nofollow",
  },
};

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }

  Object.entries(attrs).forEach(([key, value]) => element?.setAttribute(key, value));
}

function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);

  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }

  element.href = href;
}

function updateLocalBusinessSchema(url: string, description: string) {
  const id = "renshinkan-local-business-schema";
  let script = document.getElementById(id) as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": ["SportsActivityLocation", "LocalBusiness"],
    name: siteInfo.name,
    url,
    image: DEFAULT_IMAGE,
    description,
    address: {
      "@type": "PostalAddress",
      streetAddress: "155 Soi 6, Suan Luang Village, T. Baan Waen",
      addressLocality: "Hang Dong",
      addressRegion: "Chiang Mai",
      postalCode: "50230",
      addressCountry: "TH",
    },
    areaServed: ["Hang Dong", "Chiang Mai"],
    sameAs: [siteInfo.facebookUrl, siteInfo.foundationUrl],
    sport: "Aikido",
  });
}

export function Seo() {
  const location = useLocation();
  const { language, t } = useTranslation();

  useEffect(() => {
    const pathname = location.pathname === "/dojo" ? "/" : location.pathname;
    const config = seoByPath[pathname] ?? seoByPath["/"];
    const canonical = `${SITE_URL}${config.path === "/" ? "/" : config.path}`;
    const title = t(config.titleKey);
    const description = t(config.descriptionKey);

    document.title = title;
    document.documentElement.lang = htmlLangMap[language];

    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: config.robots ?? "index,follow" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: DEFAULT_IMAGE });
    upsertMeta('meta[property="og:locale"]', { property: "og:locale", content: ogLocaleByLanguage[language] });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: DEFAULT_IMAGE });
    upsertLink("canonical", canonical);

    if (config.robots?.includes("noindex")) {
      document.getElementById("renshinkan-local-business-schema")?.remove();
    } else {
      updateLocalBusinessSchema(canonical, t("seo.localBusinessDescription"));
    }
  }, [language, location.pathname, t]);

  return null;
}

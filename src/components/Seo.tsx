import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { googleMapsUrl, schedule, siteInfo } from "../data/siteContent";
import { htmlLangMap, useTranslation, type Language, type TranslationKey } from "../i18n";

const SITE_URL = (import.meta.env.VITE_SITE_URL || "https://renshinkan-dojo.pages.dev").replace(/\/+$/, "");
const DEFAULT_IMAGE = `${SITE_URL}/dojo-photos/aikido-hero-new.png`;
const LOGO_IMAGE = `${SITE_URL}/renshinkan-logo.png`;
const SEO_KEYWORDS = [
  "aikido",
  "aikido thailand",
  "aikido chiang mai",
  "aikido chaing mai",
  "aikido hang dong",
  "aikido dojo chiang mai",
  "aikido classes chiang mai",
  "martial arts chiang mai",
  "martial arts hang dong",
  "RenshinKan Dojo",
  "RenshinKan Aikido",
].join(", ");

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
  "/instructors": {
    titleKey: "seo.instructorsTitle",
    descriptionKey: "seo.instructorsDescription",
    path: "/instructors",
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

function updateStructuredData(url: string, title: string, description: string, language: Language) {
  const id = "renshinkan-structured-data-schema";
  let script = document.getElementById(id) as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: siteInfo.name,
        alternateName: ["RenshinKan Aikido", "Aikido Chiang Mai - RenshinKan Dojo"],
        url: SITE_URL,
        inLanguage: htmlLangMap[language],
        publisher: {
          "@id": `${SITE_URL}/#dojo`,
        },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        inLanguage: htmlLangMap[language],
        isPartOf: {
          "@id": `${SITE_URL}/#website`,
        },
        about: {
          "@id": `${SITE_URL}/#dojo`,
        },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: DEFAULT_IMAGE,
          caption: "Aikido training at RenshinKan Dojo in Hang Dong, Chiang Mai.",
        },
      },
      {
        "@type": ["LocalBusiness", "SportsActivityLocation", "ExerciseGym"],
        "@id": `${SITE_URL}/#dojo`,
        name: siteInfo.name,
        alternateName: [
          "RenshinKan Aikido",
          "Renshinkan Dojo Chiang Mai",
          "Aikido Chiang Mai - RenshinKan Dojo",
        ],
        url: SITE_URL,
        logo: LOGO_IMAGE,
        image: [DEFAULT_IMAGE, LOGO_IMAGE],
        description,
        keywords: SEO_KEYWORDS,
        knowsAbout: [
          "Aikido",
          "Aikido classes",
          "Martial arts",
          "Ukemi",
          "Bokken",
          "Jo",
          "Aikido in Thailand",
          "Aikido in Chiang Mai",
        ],
        hasMap: googleMapsUrl,
        address: {
          "@type": "PostalAddress",
          streetAddress: "155 Soi 6, Suan Luang Village, T. Baan Waen",
          addressLocality: "Hang Dong",
          addressRegion: "Chiang Mai",
          postalCode: "50230",
          addressCountry: "TH",
        },
        areaServed: [
          "Hang Dong",
          "Chiang Mai",
          "Chiang Mai Province",
          "Northern Thailand",
          "Thailand",
        ],
        amenityFeature: [
          { "@type": "LocationFeatureSpecification", name: "Parent viewing deck", value: true },
          { "@type": "LocationFeatureSpecification", name: "Changing rooms", value: true },
          { "@type": "LocationFeatureSpecification", name: "Drinking water", value: true },
          { "@type": "LocationFeatureSpecification", name: "Aikido weapons practice", value: true },
        ],
        openingHoursSpecification: schedule.map((classTime) => {
          const [opens, closes] = classTime.time.split(/\s+.\s+/);

          return {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: classTime.day,
            opens,
            closes,
          };
        }),
        makesOffer: [
          {
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: "Aikido classes in Hang Dong, Chiang Mai",
              serviceType: "Aikido and martial arts training",
              areaServed: "Hang Dong, Chiang Mai, Thailand",
            },
          },
        ],
        sameAs: [siteInfo.facebookUrl, siteInfo.foundationUrl],
      },
    ],
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
    upsertMeta('meta[name="keywords"]', { name: "keywords", content: SEO_KEYWORDS });
    upsertMeta('meta[name="robots"]', { name: "robots", content: config.robots ?? "index,follow" });
    upsertMeta('meta[name="geo.region"]', { name: "geo.region", content: "TH-50" });
    upsertMeta('meta[name="geo.placename"]', { name: "geo.placename", content: "Hang Dong, Chiang Mai, Thailand" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: siteInfo.name });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: DEFAULT_IMAGE });
    upsertMeta('meta[property="og:image:alt"]', { property: "og:image:alt", content: "Aikido training at RenshinKan Dojo in Hang Dong, Chiang Mai." });
    upsertMeta('meta[property="og:locale"]', { property: "og:locale", content: ogLocaleByLanguage[language] });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: DEFAULT_IMAGE });
    upsertMeta('meta[name="twitter:image:alt"]', { name: "twitter:image:alt", content: "Aikido training at RenshinKan Dojo in Hang Dong, Chiang Mai." });
    upsertLink("canonical", canonical);

    if (config.robots?.includes("noindex")) {
      document.getElementById("renshinkan-local-business-schema")?.remove();
      document.getElementById("renshinkan-structured-data-schema")?.remove();
    } else {
      updateStructuredData(canonical, title, t("seo.localBusinessDescription"), language);
    }
  }, [language, location.pathname, t]);

  return null;
}

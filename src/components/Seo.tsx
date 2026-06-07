import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { classSchedule, googleMapsUrl, siteInfo } from "../data/siteMeta";
import { htmlLangMap, useTranslation, type Language, type TranslationKey } from "../i18n";

const SITE_URL = (import.meta.env.VITE_SITE_URL || "https://renshinkandojo.org").replace(/\/+$/, "");
const DEFAULT_IMAGE = `${SITE_URL}/dojo-photos/new-hero-poster.webp`;
const LOGO_IMAGE = `${SITE_URL}/renshinkan-logo.png`;
const SEO_TOPICS = [
  "aikido",
  "Japanese martial arts",
  "self defense",
  "kids martial arts",
  "adult martial arts",
  "aiki-jujutsu history",
  "Japanese jujutsu roots",
  "dojo in Chiang Mai",
  "dojo in Hang Dong",
  "RenShinKan Dojo",
  "RenShinKan Aikido",
];

const CLASS_FAQS = [
  "experience",
  "age",
  "childrenSafety",
  "parentsWatch",
  "beginnerClothes",
  "competition",
  "falling",
  "busySchedule",
  "monthlyFee",
  "firstVisit",
] as const;

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
  "/support/payment-success": {
    titleKey: "seo.paymentSuccessTitle",
    descriptionKey: "seo.paymentSuccessDescription",
    path: "/support/payment-success",
    robots: "noindex,nofollow",
  },
  "/support/payment-incomplete": {
    titleKey: "seo.paymentIncompleteTitle",
    descriptionKey: "seo.paymentIncompleteDescription",
    path: "/support/payment-incomplete",
    robots: "noindex,nofollow",
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

const notFoundSeo: SeoConfig = {
  titleKey: "seo.notFoundTitle",
  descriptionKey: "seo.notFoundDescription",
  path: "/404",
  robots: "noindex,follow",
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

function updateStructuredData(
  url: string,
  title: string,
  description: string,
  language: Language,
  pathname: string,
  t: (key: TranslationKey) => string,
) {
  const id = "renshinkan-structured-data-schema";
  let script = document.getElementById(id) as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: siteInfo.name,
      alternateName: ["RenShinKan Aikido", "Aikido Chiang Mai - RenShinKan Dojo"],
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
        caption: "Aikido training at RenShinKan Dojo in Hang Dong, Chiang Mai.",
      },
    },
    {
      "@type": ["Organization", "LocalBusiness", "SportsActivityLocation", "ExerciseGym"],
      "@id": `${SITE_URL}/#dojo`,
      name: siteInfo.name,
      alternateName: [
        "RenShinKan Aikido",
        "RenShinKan Dojo Chiang Mai",
        "Aikido Chiang Mai - RenShinKan Dojo",
      ],
      url: SITE_URL,
      logo: LOGO_IMAGE,
      image: [DEFAULT_IMAGE, LOGO_IMAGE],
      description,
      knowsAbout: SEO_TOPICS,
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
      openingHoursSpecification: classSchedule.map((classTime) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: classTime.day,
        opens: classTime.opens,
        closes: classTime.closes,
      })),
      makesOffer: [
        {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: "Aikido classes in Hang Dong, Chiang Mai",
            serviceType: "Aikido, Japanese martial arts, and practical self-defense training",
            areaServed: "Hang Dong, Chiang Mai, Thailand",
            audience: [
              { "@type": "PeopleAudience", name: "Children" },
              { "@type": "PeopleAudience", name: "Adults" },
              { "@type": "PeopleAudience", name: "Beginners" },
            ],
          },
        },
      ],
      sameAs: [siteInfo.facebookUrl, siteInfo.foundationUrl],
    },
  ];

  if (pathname === "/classes") {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: CLASS_FAQS.map((item) => ({
        "@type": "Question",
        name: t(`classes.faq.items.${item}.question` as TranslationKey),
        acceptedAnswer: {
          "@type": "Answer",
          text: t(`classes.faq.items.${item}.answer` as TranslationKey),
        },
      })),
    });
  }

  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  });
}

export function Seo() {
  const location = useLocation();
  const { language, t } = useTranslation();

  useEffect(() => {
    const pathname = location.pathname === "/dojo" ? "/" : location.pathname;
    const config = seoByPath[pathname] ?? notFoundSeo;
    const canonical = `${SITE_URL}${config.path === "/" ? "/" : config.path}`;
    const title = t(config.titleKey);
    const description = t(config.descriptionKey);

    document.title = title;
    document.documentElement.lang = htmlLangMap[language];

    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: config.robots ?? "index,follow" });
    upsertMeta('meta[name="geo.region"]', { name: "geo.region", content: "TH-50" });
    upsertMeta('meta[name="geo.placename"]', { name: "geo.placename", content: "Hang Dong, Chiang Mai, Thailand" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: siteInfo.name });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: DEFAULT_IMAGE });
    upsertMeta('meta[property="og:image:type"]', { property: "og:image:type", content: "image/webp" });
    upsertMeta('meta[property="og:image:alt"]', { property: "og:image:alt", content: "Aikido training at RenShinKan Dojo in Hang Dong, Chiang Mai." });
    upsertMeta('meta[property="og:locale"]', { property: "og:locale", content: ogLocaleByLanguage[language] });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: DEFAULT_IMAGE });
    upsertMeta('meta[name="twitter:image:alt"]', { name: "twitter:image:alt", content: "Aikido training at RenShinKan Dojo in Hang Dong, Chiang Mai." });
    upsertLink("canonical", canonical);

    if (config.robots?.includes("noindex")) {
      document.getElementById("renshinkan-local-business-schema")?.remove();
      document.getElementById("renshinkan-structured-data-schema")?.remove();
    } else {
      updateStructuredData(canonical, title, t("seo.localBusinessDescription"), language, config.path, t);
    }
  }, [language, location.pathname, t]);

  return null;
}

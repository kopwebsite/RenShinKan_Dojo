import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { siteInfo } from "../data/siteContent";

const SITE_URL = "https://crappytaco.github.io/RenShinKan_Dojo";
const DEFAULT_IMAGE = `${SITE_URL}/dojo-photos/aikido-hero-new.png`;

type SeoConfig = {
  title: string;
  description: string;
  path: string;
  robots?: string;
};

const seoByPath: Record<string, SeoConfig> = {
  "/": {
    title: "RenshinKan Dojo | Aikido in Hang Dong, Chiang Mai",
    description:
      "RenshinKan Dojo offers traditional aikido and martial arts training in Hang Dong, Chiang Mai, with beginner friendly classes, children welcome, and visiting aikidoka invited to message ahead.",
    path: "/",
  },
  "/aikido": {
    title: "What Is Aikido? | RenshinKan Dojo Chiang Mai",
    description:
      "Learn about aikido history, O Sensei, partner practice, ukemi, weapons work, and how RenshinKan Dojo teaches aikido in Chiang Mai.",
    path: "/aikido",
  },
  "/classes": {
    title: "Aikido Classes in Hang Dong | RenshinKan Dojo",
    description:
      "Class information for aikido training in Hang Dong, Chiang Mai. See practice times, first visit guidance, belt exams, and beginner friendly class details.",
    path: "/classes",
  },
  "/workshops": {
    title: "Aikido Workshops in Chiang Mai | RenshinKan Dojo",
    description:
      "Seasonal aikido workshops for beginners, children, and current students at RenshinKan Dojo in Hang Dong, Chiang Mai.",
    path: "/workshops",
  },
  "/newsletter": {
    title: "Dojo Updates | RenshinKan Aikido Chiang Mai",
    description:
      "Recent RenshinKan Dojo updates, student news, events, photos, and aikido community notes from Hang Dong and Chiang Mai.",
    path: "/newsletter",
  },
  "/community": {
    title: "Aikido Community in Chiang Mai | RenshinKan Dojo",
    description:
      "RenshinKan Dojo is part of the Chiang Mai aikido community, connected with Peace Culture Foundation, AikidoCMU, and local martial arts practice.",
    path: "/community",
  },
  "/support": {
    title: "Support RenshinKan Dojo | Aikido Chiang Mai",
    description:
      "Support RenshinKan Dojo and help keep aikido training accessible in Hang Dong and Chiang Mai through student contributions and donations.",
    path: "/support",
  },
  "/contact": {
    title: "Contact RenshinKan Dojo | Aikido in Hang Dong",
    description:
      "Contact RenshinKan Dojo in Hang Dong, Chiang Mai to ask about aikido classes, beginner visits, children training, and visiting aikidoka practice.",
    path: "/contact",
  },
  "/visit": {
    title: "Visit RenshinKan Dojo | Aikido in Hang Dong",
    description:
      "Plan a first visit to RenshinKan Dojo in Hang Dong, Chiang Mai. Beginners, parents, and visiting aikidoka are welcome to contact the dojo.",
    path: "/visit",
  },
  "/admin": {
    title: "Admin | RenshinKan Dojo",
    description: "RenshinKan Dojo content administration.",
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

function updateLocalBusinessSchema(url: string) {
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
    description:
      "Traditional aikido and martial arts training in Hang Dong, Chiang Mai.",
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

  useEffect(() => {
    const pathname = location.pathname === "/dojo" ? "/" : location.pathname;
    const config = seoByPath[pathname] ?? seoByPath["/"];
    const canonical = `${SITE_URL}${config.path === "/" ? "/" : config.path}`;

    document.title = config.title;
    document.documentElement.lang = "en";

    upsertMeta('meta[name="description"]', { name: "description", content: config.description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: config.robots ?? "index,follow" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: config.title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: config.description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: DEFAULT_IMAGE });
    upsertMeta('meta[property="og:locale"]', { property: "og:locale", content: "en_US" });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: config.title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: config.description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: DEFAULT_IMAGE });
    upsertLink("canonical", canonical);

    if (config.robots?.includes("noindex")) {
      document.getElementById("renshinkan-local-business-schema")?.remove();
    } else {
      updateLocalBusinessSchema(canonical);
    }
  }, [location.pathname]);

  return null;
}

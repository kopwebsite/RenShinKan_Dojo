import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { useEditableContent } from "../lib/content";
import { useTranslation } from "../i18n";
import { ManagedSitePage } from "./ManagedSitePage";

export function ManagedRoute({ fallback }: { fallback: ReactNode }) {
  const location = useLocation(); const { language } = useTranslation(); const { content } = useEditableContent();
  const page = content.sitePages.find((item) => item.route === location.pathname && item.status === "published");
  useEffect(() => {
    if (!page) return;
    const translated = page.translations[language]; const fallback = page.translations.en;
    const title = translated.seoTitle || translated.title || fallback.seoTitle || fallback.title;
    const description = translated.seoDescription || fallback.seoDescription;
    if (title) document.title = title;
    if (description) {
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.append(meta); }
      meta.content = description;
    }
  }, [page, language]);
  return page ? <ManagedSitePage page={page} locale={language} /> : <>{fallback}</>;
}

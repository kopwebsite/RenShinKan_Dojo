import { type ReactNode } from "react";
import { Link } from "react-router";
import type { SiteBlock, SiteLocale, SitePage } from "../types/editableContent";

function safeUrl(value: string) { return value.startsWith("/") || /^https:\/\//i.test(value) ? value : ""; }

function InlineMarkup({ text }: { text: string }) {
  const parts: ReactNode[] = []; const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((?:\/[^)]+|https:\/\/[^)]+)\))/g; let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index || 0; if (index > last) parts.push(text.slice(last, index)); const token = match[0];
    if (token.startsWith("**")) parts.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("*")) parts.push(<em key={index}>{token.slice(1, -1)}</em>);
    else { const parsed = token.match(/^\[([^\]]+)\]\((.+)\)$/); if (parsed && safeUrl(parsed[2])) parts.push(<a key={index} href={parsed[2]} rel={parsed[2].startsWith("https://") ? "noopener noreferrer" : undefined}>{parsed[1]}</a>); else parts.push(token); }
    last = index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last)); return <>{parts}</>;
}

function RichText({ text }: { text: string }) { return <>{text.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => <p key={index}><InlineMarkup text={paragraph} /></p>)}</>; }

function Block({ block, locale }: { block: SiteBlock; locale: SiteLocale }) {
  const fallback = block.translations.en; const value = block.translations[locale];
  const content = { title: value.title || fallback.title, text: value.text || fallback.text, buttonLabel: value.buttonLabel || fallback.buttonLabel, buttonUrl: value.buttonUrl || fallback.buttonUrl, imageUrl: value.imageUrl || fallback.imageUrl, imageAlt: value.imageAlt || fallback.imageAlt };
  const className = `managed-block managed-block--${block.type} managed-block--bg-${block.background} managed-block--text-${block.textColor} managed-block--${block.align} managed-block--font-${block.font} managed-block--size-${block.fontSize} managed-block--space-${block.spacing} managed-block--image-${block.imagePlacement}`;
  if (block.type === "divider") return <hr className={className} />;
  const image = content.imageUrl && safeUrl(content.imageUrl) ? <img src={content.imageUrl} alt={content.imageAlt} loading="lazy" /> : null;
  const button = content.buttonLabel && safeUrl(content.buttonUrl) ? content.buttonUrl.startsWith("/") ? <Link className="btn-primary" to={content.buttonUrl}>{content.buttonLabel}</Link> : <a className="btn-primary" href={content.buttonUrl} rel="noopener noreferrer">{content.buttonLabel}</a> : null;
  if (block.type === "image") return <section className={className}>{image}{content.title ? <h2>{content.title}</h2> : null}</section>;
  if (block.type === "gallery") { const images = content.imageUrl.split(/\r?\n/).map((url) => url.trim()).filter(safeUrl).slice(0, 24); return <section className={className}>{content.title ? <h2>{content.title}</h2> : null}<div className="managed-gallery">{images.map((url, index) => <img key={`${url}-${index}`} src={url} alt={index === 0 ? content.imageAlt : `${content.imageAlt} ${index + 1}`.trim()} loading="lazy" />)}</div></section>; }
  if (block.type === "video") { const parsed = content.buttonUrl.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/); return <section className={className}>{content.title ? <h2>{content.title}</h2> : null}{parsed ? <iframe src={`https://www.youtube-nocookie.com/embed/${parsed[1]}`} title={content.title || "Video"} loading="lazy" allowFullScreen /> : <p>Video unavailable.</p>}</section>; }
  const body = <div className="managed-block__copy">{content.title ? block.type === "hero" ? <h1>{content.title}</h1> : <h2>{content.title}</h2> : null}{content.text ? <RichText text={content.text} /> : null}{button}</div>;
  return <section className={className}>{(block.type === "imageText" || block.type === "instructorCard") && image ? <>{image}{body}</> : <>{body}{image && block.type === "hero" ? image : null}</>}</section>;
}

export function ManagedSitePage({ page, locale }: { page: SitePage; locale: SiteLocale }) {
  return <article className="managed-page">{page.blocks.filter((block) => block.visible).map((block) => <Block key={block.id} block={block} locale={locale} />)}</article>;
}

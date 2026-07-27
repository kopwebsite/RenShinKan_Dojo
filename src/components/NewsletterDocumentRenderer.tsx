import { Fragment, type ReactNode } from "react";
import type {
  NewsletterDocument,
  NewsletterDocumentMark,
  NewsletterDocumentNode,
} from "../../shared/newsletter";

function safeHref(value: string | undefined) {
  if (!value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    return new URL(value).protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}

function renderMarkedText(text: string, marks: NewsletterDocumentMark[] = [], key: string): ReactNode {
  return marks.reduce<ReactNode>((content, mark, index) => {
    if (mark.type === "bold") return <strong key={`${key}-bold-${index}`}>{content}</strong>;
    if (mark.type === "italic") return <em key={`${key}-italic-${index}`}>{content}</em>;
    if (mark.type === "link") {
      const href = safeHref(mark.attrs?.href);
      return href ? <a key={`${key}-link-${index}`} href={href}>{content}</a> : content;
    }
    return content;
  }, text);
}

function renderChildren(node: NewsletterDocumentNode, key: string) {
  return (node.content ?? []).map((child, index) => renderNode(child, `${key}-${index}`));
}

function renderNode(node: NewsletterDocumentNode, key: string): ReactNode {
  if (node.type === "text") return <Fragment key={key}>{renderMarkedText(node.text ?? "", node.marks, key)}</Fragment>;
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "horizontalRule") return <hr key={key} />;
  const children = renderChildren(node, key);
  if (node.type === "paragraph") {
    return <p key={key} className={node.attrs?.variant === "cta" ? "newsletter-rich-cta" : undefined}>{children}</p>;
  }
  if (node.type === "heading") {
    return node.attrs?.level === 3 ? <h3 key={key}>{children}</h3> : <h2 key={key}>{children}</h2>;
  }
  if (node.type === "bulletList") return <ul key={key}>{children}</ul>;
  if (node.type === "orderedList") return <ol key={key}>{children}</ol>;
  if (node.type === "listItem") return <li key={key}>{children}</li>;
  if (node.type === "blockquote") return <blockquote key={key}>{children}</blockquote>;
  return <Fragment key={key}>{children}</Fragment>;
}

export function NewsletterDocumentRenderer({
  document,
  className = "",
}: {
  document: NewsletterDocument;
  className?: string;
}) {
  return <div className={`newsletter-rich-content ${className}`}>{renderChildren(document, "newsletter-document")}</div>;
}

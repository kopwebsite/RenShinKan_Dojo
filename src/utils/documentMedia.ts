import type { DocumentMediaKind, MediaItem } from "../types/editableContent";

type DocumentLabelSource = Pick<MediaItem, "title" | "caption" | "fileName" | "documentKind"> & {
  alt?: string;
};

export function documentKindLabel(kind: DocumentMediaKind | undefined) {
  if (kind === "pdf") {
    return "PDF";
  }

  if (kind === "docx") {
    return "DOCX";
  }

  if (kind === "ppt") {
    return "PowerPoint";
  }

  return "Document";
}

export function documentTitle(item: DocumentLabelSource) {
  return item.title || item.caption || item.fileName || item.alt || documentKindLabel(item.documentKind);
}

export function formatFileSize(size: number | undefined) {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return "";
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function absoluteDocumentUrl(src: string) {
  if (/^https?:\/\//i.test(src)) {
    return src;
  }

  if (typeof window === "undefined") {
    return src;
  }

  return new URL(src, window.location.origin).toString();
}

export function canUseRemoteDocumentViewer(src: string) {
  return !/^(blob:|data:|pending:)/i.test(src);
}

export function officeDocumentEmbedUrl(src: string) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteDocumentUrl(src))}`;
}

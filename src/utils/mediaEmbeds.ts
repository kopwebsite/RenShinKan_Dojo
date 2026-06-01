export function isValidEmbedUrl(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("<iframe")) {
    const match = trimmed.match(/src=["']([^"']+)["']/i);
    return match ? isValidEmbedUrl(match[1]) : false;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    const isEmbedPath =
      url.pathname.includes("/embed/") ||
      url.pathname.includes("/video/") ||
      url.pathname.includes("/player/");
    const isVimeoPage = host === "vimeo.com" && /^\/\d+/.test(url.pathname);

    return (
      url.protocol === "https:" &&
      (isEmbedPath ||
        host === "youtube.com" ||
        host === "youtu.be" ||
        isVimeoPage ||
        host === "player.vimeo.com" ||
        host.endsWith(".youtube.com"))
    );
  } catch {
    return false;
  }
}

export function normalizeEmbedUrl(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("<iframe")) {
    const match = trimmed.match(/src=["']([^"']+)["']/i);
    return match?.[1] ?? trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) {
        return `https://www.youtube.com/embed/${id}`;
      }

      const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shortsMatch) {
        return `https://www.youtube.com/embed/${shortsMatch[1]}`;
      }
    }

    if (host === "vimeo.com") {
      const id = url.pathname.match(/^\/(\d+)/)?.[1];
      if (id) {
        return `https://player.vimeo.com/video/${id}`;
      }
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}

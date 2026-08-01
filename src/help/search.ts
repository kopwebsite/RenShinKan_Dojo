import type { HelpArticle } from "./types";

export function normalizeHelpText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchableText(article: HelpArticle) {
  return normalizeHelpText(
    [
      article.title,
      article.summary,
      ...article.keywords,
      ...article.steps.flatMap((step) => [
        step.title,
        step.instruction,
        step.result,
      ]),
      ...article.troubleshooting.flatMap((item) => [item.issue, item.fix]),
    ].join(" "),
  );
}

export function searchHelpArticles(articles: HelpArticle[], query: string) {
  const normalized = normalizeHelpText(query);
  if (!normalized) return articles;
  const terms = normalized.split(" ").filter(Boolean);
  return articles
    .map((article) => {
      const haystack = searchableText(article);
      if (!terms.every((term) => haystack.includes(term))) return null;
      const title = normalizeHelpText(article.title);
      const keywordText = normalizeHelpText(article.keywords.join(" "));
      const score = terms.reduce(
        (total, term) =>
          total +
          (title.includes(term) ? 4 : 0) +
          (keywordText.includes(term) ? 2 : 0),
        0,
      );
      return { article, score };
    })
    .filter((match): match is { article: HelpArticle; score: number } =>
      Boolean(match),
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.article.title.localeCompare(right.article.title),
    )
    .map((match) => match.article);
}

import type { HelpArticle, HelpAudience } from "./types";

const routeTopics: Record<HelpAudience, Array<[RegExp, string[]]>> = {
  public: [
    [/^\/records\/share\//, ["public-sharing"]],
    [
      /^\/student-records/,
      [
        "public-profile",
        "public-passport",
        "public-training",
        "public-exams",
        "public-payments",
        "public-sharing",
      ],
    ],
    [/^\/newsletter/, ["public-news"]],
    [/^\/downloads/, ["public-resources"]],
    [/^\/(support|contact)/, ["public-support", "public-payments"]],
    [/^\/(aikido|classes|instructors|workshops)?$/, ["public-start"]],
  ],
  admin: [
    [/^\/admin\/students/, ["admin-students"]],
    [/^\/admin\/profile-requests/, ["admin-students"]],
    [/^\/admin\/training-requests/, ["admin-training"]],
    [/^\/admin\/(exam-applications|examination-records)/, ["admin-exams"]],
    [
      /^\/admin\/(monthly-contributions|aat-contributions|payment-proofs)/,
      ["admin-payments"],
    ],
    [/^\/admin\/galleries\//, ["admin-gallery"]],
    [/^\/admin\/downloads/, ["admin-downloads"]],
    [/^\/admin\/website/, ["admin-newsletters", "admin-gallery"]],
    [/^\/admin\/(dojos|memberships|audit)/, ["admin-audit", "admin-scope"]],
    [/^\/admin\/dashboard/, ["admin-dashboard", "admin-scope"]],
    [/^\/admin\/?$/, ["admin-access", "admin-dashboard"]],
  ],
};

export function suggestedHelpArticles(
  audience: HelpAudience,
  pathname: string,
  articles: HelpArticle[],
) {
  const ids =
    routeTopics[audience].find(([pattern]) => pattern.test(pathname))?.[1] ||
    [];
  const byId = new Map(articles.map((article) => [article.id, article]));
  const suggestions = ids
    .map((id) => byId.get(id))
    .filter((article): article is HelpArticle => Boolean(article));
  return suggestions.length ? suggestions : articles.slice(0, 2);
}

export function validHelpArticle(articles: HelpArticle[], id: string | null) {
  return id ? articles.find((article) => article.id === id) || null : null;
}

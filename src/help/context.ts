import type { HelpArticle, HelpAudience } from "./types";

const routeTopics: Record<HelpAudience, Array<[RegExp, string[]]>> = {
  public: [
    [/^\/records\/share\//, ["public-passport"]],
    [
      /^\/student-records/,
      [
        "public-new-profile",
        "public-passport",
        "public-exam-application",
        "public-monthly",
        "public-aat",
      ],
    ],
    [/^\/newsletter/, ["public-newsletter", "public-newsletter-email"]],
    [/^\/downloads/, ["public-newsletter"]],
    [
      /^\/(support|contact)/,
      ["public-contact", "public-donation", "public-monthly"],
    ],
    [
      /^\/(aikido|classes|instructors|workshops)?$/,
      ["public-new-profile", "public-newsletter"],
    ],
  ],
  admin: [
    [/^\/admin\/students/, ["admin-students", "admin-complete-record"]],
    [/^\/admin\/profile-requests/, ["admin-profile-approval"]],
    [/^\/admin\/training-requests/, ["admin-training"]],
    [
      /^\/admin\/(exam-applications|examination-records|exam-payslips)/,
      ["admin-exams", "admin-exam-records"],
    ],
    [
      /^\/admin\/(monthly-contributions|aat-contributions|payment-proofs)/,
      ["admin-payments", "admin-bulk-proofs"],
    ],
    [/^\/admin\/galleries\//, ["admin-gallery"]],
    [/^\/admin\/downloads/, ["admin-downloads"]],
    [/^\/admin\/website/, ["admin-newsletters", "admin-gallery"]],
    [/^\/admin\/(dojos|memberships|audit)/, ["admin-audit", "admin-scope"]],
    [/^\/admin\/dashboard/, ["admin-dashboard", "admin-scope"]],
    [/^\/admin\/?$/, ["admin-students", "admin-profile-approval"]],
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

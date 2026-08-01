import {
  AArrowDown,
  AArrowUp,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { getAdminHelpCatalog } from "./content/admin";
import { getPublicHelpCatalog } from "./content/public";
import { suggestedHelpArticles, validHelpArticle } from "./context";
import { searchHelpArticles } from "./search";
import type {
  HelpArticle,
  HelpAudience,
  HelpCategory,
  HelpLocale,
} from "./types";
import "./help.css";

function GuideImage({
  article,
  src,
  alt,
  caption,
  fallback,
}: {
  article: HelpArticle;
  src: string;
  alt: string;
  caption: string;
  fallback: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed)
    return (
      <div className="help-image-fallback" role="img" aria-label={fallback}>
        {fallback}
      </div>
    );
  return (
    <figure className="help-figure" data-help-topic={article.id}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function TopicButton({
  article,
  onSelect,
}: {
  article: HelpArticle;
  onSelect(article: HelpArticle): void;
}) {
  return (
    <button
      className="help-topic"
      type="button"
      onClick={() => onSelect(article)}
    >
      <span>
        <strong>{article.title}</strong>
        <small>{article.summary}</small>
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
  );
}

export function HelpPanel({
  audience,
  locale,
  onClose,
  triggerRef,
}: {
  audience: HelpAudience;
  locale: HelpLocale;
  onClose(): void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const catalog = useMemo(
    () =>
      audience === "admin"
        ? getAdminHelpCatalog(locale === "th" ? "th" : "en")
        : getPublicHelpCatalog(
            locale === "th" || locale === "ja" || locale === "zh-CN"
              ? locale
              : "en",
          ),
    [audience, locale],
  );
  const directId = new URLSearchParams(location.search).get("help");
  const [selectedId, setSelectedId] = useState(
    () => validHelpArticle(catalog.articles, directId)?.id || null,
  );
  const [query, setQuery] = useState("");
  const [fontScale, setFontScale] = useState(1);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const searchRef = useRef<HTMLInputElement>(null);
  const articleTitleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const selected = validHelpArticle(catalog.articles, selectedId);
  const suggestions = useMemo(
    () => suggestedHelpArticles(audience, location.pathname, catalog.articles),
    [audience, catalog.articles, location.pathname],
  );
  const results = useMemo(
    () => searchHelpArticles(catalog.articles, query),
    [catalog.articles, query],
  );
  const grouped = useMemo(
    () =>
      results.reduce<Partial<Record<HelpCategory, HelpArticle[]>>>(
        (all, article) => {
          (all[article.category] ||= []).push(article);
          return all;
        },
        {},
      ),
    [results],
  );

  useEffect(() => {
    const article = validHelpArticle(catalog.articles, directId);
    if (article) setSelectedId(article.id);
  }, [catalog.articles, directId]);

  useEffect(() => {
    if (!selected) return;
    bodyRef.current?.scrollTo({ top: 0, behavior: "auto" });
    articleTitleRef.current?.focus();
  }, [selected?.id]);

  function updateDirectLink(id: string | null) {
    const params = new URLSearchParams(location.search);
    if (id) params.set("help", id);
    else params.delete("help");
    const next = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: next ? `?${next}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
  }

  function selectArticle(article: HelpArticle) {
    setSelectedId(article.id);
    setQuery("");
    setCopyState("idle");
    updateDirectLink(article.id);
  }

  function showIndex() {
    setSelectedId(null);
    setCopyState("idle");
    updateDirectLink(null);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  async function copyLink() {
    if (!selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set("help", selected.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopyState("copied");
    } catch {
      setCopyState("idle");
    }
  }

  const titleId = `${audience}-help-title`;
  const descriptionId = `${audience}-help-description`;
  return (
    <AccessibleDialog
      open
      onClose={onClose}
      triggerRef={triggerRef}
      initialFocusRef={searchRef}
      titleId={titleId}
      descriptionId={descriptionId}
      backdropClassName="help-backdrop"
      panelClassName={`help-panel help-panel--${audience}`}
      panelAs="section"
    >
      <div className="help-panel__header">
        <div>
          <span className="help-panel__eyebrow">
            {audience === "admin" ? "Auggie" : catalog.ui.trigger}
          </span>
          <h1 id={titleId}>{catalog.ui.heading}</h1>
          <p id={descriptionId}>{catalog.ui.guideDescription}</p>
        </div>
        <button
          className="help-icon-button"
          type="button"
          onClick={onClose}
          aria-label={catalog.ui.close}
        >
          <X aria-hidden="true" />
        </button>
        <div className="help-text-controls" aria-label={catalog.ui.heading}>
          <button
            type="button"
            onClick={() => setFontScale((value) => Math.max(0.9, value - 0.1))}
            aria-label={catalog.ui.smallerText}
            disabled={fontScale <= 0.9}
          >
            <AArrowDown aria-hidden="true" />
          </button>
          <span aria-hidden="true">AA</span>
          <button
            type="button"
            onClick={() => setFontScale((value) => Math.min(1.3, value + 0.1))}
            aria-label={catalog.ui.largerText}
            disabled={fontScale >= 1.3}
          >
            <AArrowUp aria-hidden="true" />
          </button>
        </div>
        <label className="help-search">
          <span>{catalog.ui.searchLabel}</span>
          <span>
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              autoFocus
              type="search"
              value={query}
              placeholder={catalog.ui.searchPlaceholder}
              onChange={(event) => {
                setQuery(event.target.value);
                if (selectedId) showIndex();
              }}
            />
          </span>
        </label>
        <p className="help-search-status" role="status" aria-live="polite">
          {catalog.ui.searchStatus(results.length)}
        </p>
      </div>

      <div
        ref={bodyRef}
        className="help-panel__body"
        style={{ "--help-font-scale": fontScale } as CSSProperties}
      >
        {selected ? (
          <article className="help-article">
            <button className="help-back" type="button" onClick={showIndex}>
              <ArrowLeft aria-hidden="true" />
              {catalog.ui.back}
            </button>
            <nav className="help-breadcrumb" aria-label={catalog.ui.breadcrumb}>
              <button type="button" onClick={showIndex}>
                {catalog.ui.breadcrumb}
              </button>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{selected.title}</span>
            </nav>
            <h2 ref={articleTitleRef} tabIndex={-1}>
              {selected.title}
            </h2>
            <p className="help-article__summary">{selected.summary}</p>
            <button
              className="help-copy-link"
              type="button"
              onClick={() => void copyLink()}
            >
              {copyState === "copied" ? (
                <Check aria-hidden="true" />
              ) : (
                <Copy aria-hidden="true" />
              )}
              {copyState === "copied" ? catalog.ui.copied : catalog.ui.copyLink}
            </button>
            {selected.screenshots.map((screenshot) => (
              <GuideImage
                key={screenshot.src}
                article={selected}
                {...screenshot}
                fallback={catalog.ui.imageUnavailable}
              />
            ))}
            <section>
              <h3>{catalog.ui.steps}</h3>
              <ol className="help-steps">
                {selected.steps.map((step, index) => (
                  <li key={`${selected.id}-${index}`}>
                    <h4>{step.title}</h4>
                    <p>{step.instruction}</p>
                    <p className="help-step-result">
                      <strong>{catalog.ui.expectedResult}:</strong>{" "}
                      {step.result}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
            <section className="help-troubleshooting">
              <h3>{catalog.ui.troubleshooting}</h3>
              {selected.troubleshooting.map((item) => (
                <div key={item.issue}>
                  <h4>{item.issue}</h4>
                  <p>{item.fix}</p>
                </div>
              ))}
            </section>
            {selected.related.length ? (
              <section>
                <h3>{catalog.ui.related}</h3>
                <div className="help-related">
                  {selected.related.map((id) => {
                    const article = validHelpArticle(catalog.articles, id);
                    return article ? (
                      <button
                        key={id}
                        type="button"
                        onClick={() => selectArticle(article)}
                      >
                        {article.title}
                        <ChevronRight aria-hidden="true" />
                      </button>
                    ) : null;
                  })}
                </div>
              </section>
            ) : null}
          </article>
        ) : (
          <div className="help-index">
            {!query && suggestions.length ? (
              <section>
                <h2>{catalog.ui.suggested}</h2>
                <div className="help-topic-list">
                  {suggestions.map((article) => (
                    <TopicButton
                      key={article.id}
                      article={article}
                      onSelect={selectArticle}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            <section>
              <h2>{catalog.ui.allTopics}</h2>
              {results.length ? (
                Object.entries(grouped).map(([category, articles]) => (
                  <section className="help-category" key={category}>
                    <h3>{catalog.ui.categories[category as HelpCategory]}</h3>
                    <div className="help-topic-list">
                      {articles?.map((article) => (
                        <TopicButton
                          key={article.id}
                          article={article}
                          onSelect={selectArticle}
                        />
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="help-empty">
                  <p>{catalog.ui.noResults}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                  >
                    {catalog.ui.resetSearch}
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AccessibleDialog>
  );
}

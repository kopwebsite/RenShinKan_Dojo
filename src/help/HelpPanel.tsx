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
import {
  parsePublicHelpAssistantResponse,
  publicHelpAssistantCopy,
  type PublicHelpAssistantLocale,
} from "./publicAssistant";
import { searchHelpArticles } from "./search";
import type {
  HelpArticle,
  HelpAudience,
  HelpCategory,
  HelpLocale,
} from "./types";
import "./help.css";

/**
 * Renders `**…**` as bold so a step can name the exact button, tab, or menu the
 * reader has to select. Everything else stays plain text; no HTML is parsed.
 */
function StepText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
        index % 2 ? (
          <strong key={index} className="help-step-target">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
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
  const [assistantState, setAssistantState] = useState<
    "idle" | "loading" | "unknown" | "private" | "rate-limited" | "unavailable"
  >("idle");
  const searchRef = useRef<HTMLInputElement>(null);
  const articleTitleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const assistantAbortRef = useRef<AbortController | null>(null);
  const assistantLocale: PublicHelpAssistantLocale | null =
    audience === "public" && (locale === "en" || locale === "th")
      ? locale
      : null;
  const assistantCopy = assistantLocale
    ? publicHelpAssistantCopy[assistantLocale]
    : null;
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

  useEffect(
    () => () => {
      assistantAbortRef.current?.abort();
    },
    [],
  );

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
    setAssistantState("idle");
    updateDirectLink(article.id);
  }

  function showIndex() {
    setSelectedId(null);
    setCopyState("idle");
    setAssistantState("idle");
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

  async function askPublicAssistant() {
    const question = query.trim();
    if (!assistantLocale || question.length < 2) return;

    assistantAbortRef.current?.abort();
    const controller = new AbortController();
    assistantAbortRef.current = controller;
    setAssistantState("loading");
    try {
      const response = await fetch("/api/help/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, locale: assistantLocale }),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (assistantAbortRef.current !== controller) return;
      if (response.status === 429) {
        setAssistantState("rate-limited");
        return;
      }
      if (!response.ok) {
        setAssistantState("unavailable");
        return;
      }

      const result = parsePublicHelpAssistantResponse(await response.json());
      if (!result) {
        setAssistantState("unavailable");
        return;
      }
      if (result.outcome === "match") {
        const article = validHelpArticle(catalog.articles, result.topicId);
        if (!article || article.audience !== "public") {
          setAssistantState("unavailable");
          return;
        }
        selectArticle(article);
        return;
      }
      setAssistantState(result.outcome);
    } catch {
      if (!controller.signal.aborted) setAssistantState("unavailable");
    } finally {
      if (assistantAbortRef.current === controller) {
        assistantAbortRef.current = null;
      }
    }
  }

  const assistantMessage = assistantCopy
    ? assistantState === "loading"
      ? assistantCopy.asking
      : assistantState === "private"
        ? assistantCopy.private
        : assistantState === "unknown"
          ? assistantCopy.unknown
          : assistantState === "rate-limited"
            ? assistantCopy.rateLimited
            : assistantState === "unavailable"
              ? assistantCopy.unavailable
              : ""
    : "";

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
          <span className="help-panel__eyebrow">{catalog.ui.trigger}</span>
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
              maxLength={500}
              value={query}
              placeholder={catalog.ui.searchPlaceholder}
              onChange={(event) => {
                setQuery(event.target.value);
                setAssistantState("idle");
                if (selectedId) showIndex();
              }}
            />
          </span>
        </label>
        {assistantCopy ? (
          <div className="help-assistant">
            <button
              type="button"
              onClick={() => void askPublicAssistant()}
              disabled={query.trim().length < 2 || assistantState === "loading"}
              aria-describedby="public-help-assistant-privacy"
            >
              {assistantState === "loading"
                ? assistantCopy.asking
                : assistantCopy.ask}
            </button>
            <p id="public-help-assistant-privacy">
              {assistantCopy.privacyNotice}
            </p>
          </div>
        ) : null}
        <p className="help-search-status" role="status" aria-live="polite">
          {catalog.ui.searchStatus(results.length)}
        </p>
        {assistantMessage ? (
          <p
            className={`help-assistant-status help-assistant-status--${assistantState}`}
            role="status"
            aria-live="polite"
          >
            {assistantMessage}
          </p>
        ) : null}
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
            <section>
              <h3>{catalog.ui.steps}</h3>
              <ol className="help-steps">
                {selected.steps.map((step, index) => (
                  <li key={`${selected.id}-${index}`}>
                    <p>
                      <StepText text={step.instruction} />
                    </p>
                  </li>
                ))}
              </ol>
            </section>
            <a className="help-action" href={selected.action.href}>
              {selected.action.label}
              <ChevronRight aria-hidden="true" />
            </a>
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

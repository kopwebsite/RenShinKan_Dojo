import {
  AArrowDown,
  AArrowUp,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  LoaderCircle,
  RotateCcw,
  Search,
  Send,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { getAdminHelpCatalog } from "./content/admin";
import { getPublicHelpCatalog } from "./content/public";
import { suggestedHelpArticles, validHelpArticle } from "./context";
import {
  emptyPublicHelpMemory,
  parsePublicHelpAssistantResponse,
  parseStoredPublicHelpChat,
  publicHelpAssistantCopy,
  publicHelpPageContext,
  PUBLIC_HELP_CHAT_MAX_MODEL_MESSAGES,
  PUBLIC_HELP_CHAT_MAX_VISIBLE_MESSAGES,
  PUBLIC_HELP_CHAT_STORAGE_KEY,
  type PublicHelpAssistantLocale,
  type PublicHelpChatMemory,
  type PublicHelpUiMessage,
} from "./publicAssistant";
import { searchHelpArticles } from "./search";
import type {
  HelpArticle,
  HelpAudience,
  HelpCategory,
  HelpCatalog,
  HelpLocale,
} from "./types";
import "./help.css";

/** Renders only the help catalog's small `**control name**` convention. */
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

function TextControls({
  label,
  value,
  onChange,
  smaller,
  larger,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
  smaller: string;
  larger: string;
}) {
  return (
    <div className="help-text-controls" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0.9, value - 0.1))}
        aria-label={smaller}
        disabled={value <= 0.9}
      >
        <AArrowDown aria-hidden="true" />
      </button>
      <span aria-hidden="true">AA</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(1.3, value + 0.1))}
        aria-label={larger}
        disabled={value >= 1.3}
      >
        <AArrowUp aria-hidden="true" />
      </button>
    </div>
  );
}

function HelpArticleView({
  article,
  catalog,
  onBack,
}: {
  article: HelpArticle;
  catalog: HelpCatalog;
  onBack(): void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  useEffect(() => titleRef.current?.focus(), [article.id]);

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("help", article.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopyState("copied");
    } catch {
      setCopyState("idle");
    }
  }

  return (
    <article className="help-article">
      <button className="help-back" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        {catalog.ui.back}
      </button>
      <nav className="help-breadcrumb" aria-label={catalog.ui.breadcrumb}>
        <button type="button" onClick={onBack}>
          {catalog.ui.breadcrumb}
        </button>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{article.title}</span>
      </nav>
      <h2 ref={titleRef} tabIndex={-1}>
        {article.title}
      </h2>
      <p className="help-article__summary">{article.summary}</p>
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
          {article.steps.map((step, index) => (
            <li key={`${article.id}-${index}`}>
              <p>
                <StepText text={step.instruction} />
              </p>
            </li>
          ))}
        </ol>
      </section>
      <a className="help-action" href={article.action.href}>
        {article.action.label}
        <ChevronRight aria-hidden="true" />
      </a>
    </article>
  );
}

function HelpIndex({
  catalog,
  suggestions,
  query,
  onQuery,
  onSelect,
  searchRef,
}: {
  catalog: HelpCatalog;
  suggestions: HelpArticle[];
  query: string;
  onQuery(value: string): void;
  onSelect(article: HelpArticle): void;
  searchRef?: RefObject<HTMLInputElement | null>;
}) {
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
  return (
    <div className="help-index">
      <label className="help-search">
        <span>{catalog.ui.searchLabel}</span>
        <span>
          <Search aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            maxLength={200}
            value={query}
            placeholder={catalog.ui.searchPlaceholder}
            onChange={(event) => onQuery(event.target.value)}
          />
        </span>
      </label>
      <p className="help-search-status" role="status" aria-live="polite">
        {catalog.ui.searchStatus(results.length)}
      </p>
      {!query && suggestions.length ? (
        <section>
          <h2>{catalog.ui.suggested}</h2>
          <div className="help-topic-list">
            {suggestions.map((article) => (
              <TopicButton
                key={article.id}
                article={article}
                onSelect={onSelect}
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
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="help-empty">
            <p>{catalog.ui.noResults}</p>
            <button type="button" onClick={() => onQuery("")}>
              {catalog.ui.resetSearch}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function StaticHelpPanel({
  catalog,
  audience,
  onClose,
  triggerRef,
}: {
  catalog: HelpCatalog;
  audience: HelpAudience;
  onClose(): void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const directId = new URLSearchParams(location.search).get("help");
  const [selectedId, setSelectedId] = useState(
    () => validHelpArticle(catalog.articles, directId)?.id || null,
  );
  const [query, setQuery] = useState("");
  const [fontScale, setFontScale] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = validHelpArticle(catalog.articles, selectedId);
  const suggestions = useMemo(
    () => suggestedHelpArticles(audience, location.pathname, catalog.articles),
    [audience, catalog.articles, location.pathname],
  );

  useEffect(() => {
    const article = validHelpArticle(catalog.articles, directId);
    if (article) setSelectedId(article.id);
  }, [catalog.articles, directId]);

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
        <TextControls
          label={catalog.ui.heading}
          value={fontScale}
          onChange={setFontScale}
          smaller={catalog.ui.smallerText}
          larger={catalog.ui.largerText}
        />
      </div>
      <div
        className="help-panel__body"
        style={{ "--help-font-scale": fontScale } as CSSProperties}
      >
        {selected ? (
          <HelpArticleView
            article={selected}
            catalog={catalog}
            onBack={() => {
              setSelectedId(null);
              updateDirectLink(null);
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
          />
        ) : (
          <HelpIndex
            catalog={catalog}
            suggestions={suggestions}
            query={query}
            onQuery={setQuery}
            onSelect={(article) => {
              setSelectedId(article.id);
              setQuery("");
              updateDirectLink(article.id);
            }}
            searchRef={searchRef}
          />
        )}
      </div>
    </AccessibleDialog>
  );
}

function initialConversation(locale: PublicHelpAssistantLocale): {
  messages: PublicHelpUiMessage[];
  memory: PublicHelpChatMemory;
} {
  try {
    const restored = parseStoredPublicHelpChat(
      sessionStorage.getItem(PUBLIC_HELP_CHAT_STORAGE_KEY),
      locale,
    );
    if (restored) return restored;
  } catch {
    // Some privacy modes disable browser storage; an in-memory chat still works.
  }
  return {
    messages: [
      {
        role: "assistant",
        content: publicHelpAssistantCopy[locale].welcome,
      },
    ],
    memory: emptyPublicHelpMemory(locale),
  };
}

function PublicChatPanel({
  catalog,
  locale,
  onClose,
  triggerRef,
}: {
  catalog: HelpCatalog;
  locale: PublicHelpAssistantLocale;
  onClose(): void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const copy = publicHelpAssistantCopy[locale];
  const directId = new URLSearchParams(location.search).get("help");
  const [conversation, setConversation] = useState(() =>
    initialConversation(locale),
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [guideQuery, setGuideQuery] = useState("");
  const [selectedId, setSelectedId] = useState(
    () => validHelpArticle(catalog.articles, directId)?.id || null,
  );
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const selected = validHelpArticle(catalog.articles, selectedId);
  const suggestions = useMemo(
    () => suggestedHelpArticles("public", location.pathname, catalog.articles),
    [catalog.articles, location.pathname],
  );
  const activeTopic = conversation.memory.topic || conversation.memory.form;

  useEffect(() => {
    try {
      sessionStorage.setItem(
        PUBLIC_HELP_CHAT_STORAGE_KEY,
        JSON.stringify(conversation),
      );
    } catch {
      // Keep the active in-memory chat usable when tab storage is unavailable.
    }
  }, [conversation]);

  useEffect(() => {
    const article = validHelpArticle(catalog.articles, directId);
    setSelectedId(article?.id || null);
  }, [catalog.articles, directId]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    if (typeof transcript.scrollTo === "function") {
      transcript.scrollTo({
        top: transcript.scrollHeight,
        behavior: "smooth",
      });
    } else {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [busy, conversation.messages.length]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  function appendAssistant(
    content: string,
    links: PublicHelpUiMessage["links"] = [],
    memory = conversation.memory,
  ) {
    setConversation((current) => ({
      memory,
      messages: [
        ...current.messages,
        { role: "assistant", content, ...(links?.length ? { links } : {}) },
      ].slice(-PUBLIC_HELP_CHAT_MAX_VISIBLE_MESSAGES),
    }));
  }

  function staticFallback(question: string, message: string) {
    const guides = searchHelpArticles(catalog.articles, question).slice(0, 2);
    appendAssistant(
      message,
      guides.map((article) => article.action),
    );
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    const history = conversation.messages.slice(
      -PUBLIC_HELP_CHAT_MAX_MODEL_MESSAGES,
    );
    setConversation((current) => ({
      ...current,
      messages: [...current.messages, { role: "user", content: message }].slice(
        -PUBLIC_HELP_CHAT_MAX_VISIBLE_MESSAGES,
      ),
    }));
    setInput("");
    setBusy(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/help/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          message,
          messages: history.map(({ role, content }) => ({ role, content })),
          page: publicHelpPageContext(
            location.pathname,
            location.search,
            document.getElementById("student-hours-form")
              ? "training-hours"
              : document.querySelector(".exam-application-form")
                ? "exam"
                : document.querySelector(".student-profile-form")
                  ? "profile"
                  : null,
          ),
          memory: conversation.memory,
        }),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (abortRef.current !== controller) return;
      if (response.status === 429) {
        staticFallback(message, copy.rateLimited);
        return;
      }
      if (!response.ok) {
        staticFallback(message, copy.fallback);
        return;
      }
      const result = parsePublicHelpAssistantResponse(
        await response.json(),
        locale,
      );
      if (!result) {
        staticFallback(message, copy.error);
        return;
      }
      if (result.outcome === "unavailable") {
        staticFallback(message, copy.fallback);
        return;
      }
      appendAssistant(result.reply, result.links, result.memory);
    } catch {
      if (!controller.signal.aborted) staticFallback(message, copy.error);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function resetConversation() {
    if (!window.confirm(copy.resetConfirm)) return;
    abortRef.current?.abort();
    abortRef.current = null;
    try {
      sessionStorage.removeItem(PUBLIC_HELP_CHAT_STORAGE_KEY);
    } catch {
      // Reset still clears React state when browser storage is unavailable.
    }
    setConversation({
      messages: [{ role: "assistant", content: copy.welcome }],
      memory: emptyPublicHelpMemory(locale),
    });
    setInput("");
    setGuideQuery("");
    setSelectedId(null);
    updateDirectLink(null);
    setBusy(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

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

  return (
    <AccessibleDialog
      open
      onClose={onClose}
      triggerRef={triggerRef}
      initialFocusRef={composerRef}
      titleId="public-help-title"
      descriptionId="public-help-description"
      backdropClassName="help-backdrop"
      panelClassName="help-panel help-panel--public help-panel--chat"
      panelAs="section"
    >
      <div className="help-panel__header public-help-header">
        <div>
          <span className="help-panel__eyebrow">{catalog.ui.trigger}</span>
          <h1 id="public-help-title">{copy.heading}</h1>
          <p id="public-help-description">{copy.hint}</p>
        </div>
        <button
          className="help-icon-button"
          type="button"
          onClick={onClose}
          aria-label={catalog.ui.close}
        >
          <X aria-hidden="true" />
        </button>
        <div className="public-help-header__tools">
          <TextControls
            label={copy.heading}
            value={fontScale}
            onChange={setFontScale}
            smaller={catalog.ui.smallerText}
            larger={catalog.ui.largerText}
          />
          <button
            className="public-help-reset"
            type="button"
            onClick={resetConversation}
          >
            <RotateCcw size={16} aria-hidden="true" />
            {copy.reset}
          </button>
        </div>
        {activeTopic ? (
          <p className="public-help-topic" role="status">
            <span>{copy.helpingWith}</span>
            <strong>{activeTopic}</strong>
          </p>
        ) : null}
      </div>

      <div
        className="public-help-chat"
        style={{ "--help-font-scale": fontScale } as CSSProperties}
      >
        <div
          ref={transcriptRef}
          className="public-help-transcript"
          role="log"
          aria-label={copy.heading}
          aria-live="polite"
          aria-relevant="additions text"
        >
          {conversation.messages.map((message, index) => (
            <article
              className={`public-help-message public-help-message--${message.role}`}
              key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
            >
              <span className="public-help-message__speaker">
                {message.role === "user" ? copy.you : copy.assistant}
              </span>
              <p>{message.content}</p>
              {message.links?.length ? (
                <nav aria-label={message.content.slice(0, 80)}>
                  {message.links.map((link) => (
                    <a key={`${link.href}-${link.label}`} href={link.href}>
                      {link.label}
                      <ChevronRight size={16} aria-hidden="true" />
                    </a>
                  ))}
                </nav>
              ) : null}
            </article>
          ))}
          {busy ? (
            <p className="public-help-loading" role="status">
              <LoaderCircle className="spin" aria-hidden="true" />
              {copy.sending}
            </p>
          ) : null}
        </div>

        <form className="public-help-composer" onSubmit={sendMessage}>
          <label htmlFor="public-help-message">{copy.placeholder}</label>
          <div>
            <textarea
              ref={composerRef}
              id="public-help-message"
              rows={2}
              maxLength={800}
              value={input}
              placeholder={copy.placeholder}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onComposerKeyDown}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || input.trim().length < 2}
              aria-label={copy.send}
            >
              <Send aria-hidden="true" />
              <span>{copy.send}</span>
            </button>
          </div>
          <small>Enter · Shift+Enter</small>
        </form>

        <details className="public-help-privacy">
          <summary>{copy.privacySummary}</summary>
          <p>{copy.privacy}</p>
        </details>

        <details className="public-help-guides" open={Boolean(selected)}>
          <summary>
            <span>
              <strong>{copy.guides}</strong>
              <small>{copy.guidesHint}</small>
            </span>
          </summary>
          <div className="public-help-guides__body">
            {selected ? (
              <HelpArticleView
                article={selected}
                catalog={catalog}
                onBack={() => {
                  setSelectedId(null);
                  updateDirectLink(null);
                }}
              />
            ) : (
              <HelpIndex
                catalog={catalog}
                suggestions={suggestions}
                query={guideQuery}
                onQuery={setGuideQuery}
                onSelect={(article) => {
                  setSelectedId(article.id);
                  setGuideQuery("");
                  updateDirectLink(article.id);
                }}
              />
            )}
          </div>
        </details>
      </div>
    </AccessibleDialog>
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
  if (audience === "public" && (locale === "en" || locale === "th")) {
    return (
      <PublicChatPanel
        catalog={getPublicHelpCatalog(locale)}
        locale={locale}
        onClose={onClose}
        triggerRef={triggerRef}
      />
    );
  }
  const catalog =
    audience === "admin"
      ? getAdminHelpCatalog(locale === "th" ? "th" : "en")
      : getPublicHelpCatalog(
          locale === "ja" || locale === "zh-CN" ? locale : "en",
        );
  return (
    <StaticHelpPanel
      catalog={catalog}
      audience={audience}
      onClose={onClose}
      triggerRef={triggerRef}
    />
  );
}

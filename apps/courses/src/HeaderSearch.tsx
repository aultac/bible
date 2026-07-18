import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  loadLessonSearchIndex,
  searchLessonIndex,
  type LessonSearchIndex,
  type LessonSearchResult,
} from "./lessonSearch";

type SearchStatus = "idle" | "loading" | "ready" | "error";

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function HighlightMatches({
  text,
  terms,
}: {
  text: string;
  terms: string[];
}) {
  const usableTerms = [...terms]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  if (usableTerms.length === 0) {
    return text;
  }

  const pattern = new RegExp(
    `(${usableTerms.map(escapeRegularExpression).join("|")})`,
    "giu"
  );
  const exactPattern = new RegExp(
    `^(?:${usableTerms.map(escapeRegularExpression).join("|")})$`,
    "iu"
  );

  return text.split(pattern).map((part, index): ReactNode =>
    exactPattern.test(part) ? <mark key={`${part}-${index}`}>{part}</mark> : part
  );
}

export function HeaderSearch() {
  const navigate = useNavigate();
  const searchRootRef = useRef<HTMLDivElement>(null);
  const searchIndexRef = useRef<LessonSearchIndex | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [results, setResults] = useState<LessonSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);

  const ensureSearchIndex = useCallback(async () => {
    if (searchIndexRef.current) {
      return searchIndexRef.current;
    }

    setStatus("loading");

    try {
      const searchIndex = await loadLessonSearchIndex();
      searchIndexRef.current = searchIndex;
      setStatus("ready");
      return searchIndex;
    } catch (error) {
      console.error("Unable to load the lesson search index.", error);
      setStatus("error");
      throw error;
    }
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        searchRootRef.current &&
        !searchRootRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    let isCancelled = false;

    if (trimmedQuery.length < 2) {
      setResults([]);
      setActiveIndex(-1);
      return () => {
        isCancelled = true;
      };
    }

    const timer = window.setTimeout(() => {
      ensureSearchIndex()
        .then((searchIndex) => {
          if (isCancelled) {
            return;
          }
          setResults(searchLessonIndex(searchIndex, trimmedQuery));
          setActiveIndex(-1);
          setIsOpen(true);
        })
        .catch(() => {
          if (!isCancelled) {
            setResults([]);
          }
        });
    }, 100);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [ensureSearchIndex, query]);

  function chooseResult(result: LessonSearchResult) {
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
    setIsOpen(false);
    navigate(result.path);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        current >= results.length - 1 ? 0 : current + 1
      );
      return;
    }

    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        current <= 0 ? results.length - 1 : current - 1
      );
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Enter") {
      const result = results[activeIndex >= 0 ? activeIndex : 0];
      if (result) {
        event.preventDefault();
        chooseResult(result);
      }
    }
  }

  const showPanel = isOpen && query.trim().length >= 2;

  return (
    <div className="header-search" role="search" ref={searchRootRef}>
      <label className="visually-hidden" htmlFor="lesson-search">
        Search lesson notes
      </label>
      <div className="header-search-input">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="18"
          height="18"
        >
          <circle cx="10.7" cy="10.7" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m15.2 15.2 5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
        <input
          id="lesson-search"
          type="search"
          role="combobox"
          value={query}
          placeholder="Search lessons"
          autoComplete="off"
          aria-label="Search lesson notes"
          aria-autocomplete="list"
          aria-controls="lesson-search-results"
          aria-expanded={showPanel}
          aria-activedescendant={
            activeIndex >= 0 ? `lesson-search-result-${activeIndex}` : undefined
          }
          onFocus={() => {
            void ensureSearchIndex().catch(() => undefined);
            if (query.trim().length >= 2) {
              setIsOpen(true);
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(event.target.value.trim().length >= 2);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      {showPanel ? (
        <div className="header-search-panel">
          {status === "loading" ? (
            <p className="search-panel-state" role="status">
              Loading lesson search…
            </p>
          ) : status === "error" ? (
            <p className="search-panel-state" role="status">
              Lesson search is unavailable right now.
            </p>
          ) : status === "ready" && results.length === 0 ? (
            <p className="search-panel-state" role="status">
              No lesson notes match “{query.trim()}”.
            </p>
          ) : (
            <ul id="lesson-search-results" role="listbox">
              {results.map((result, index) => (
                <li key={result.path} role="presentation">
                  <button
                    type="button"
                    id={`lesson-search-result-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={
                      index === activeIndex ? "search-result-active" : undefined
                    }
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => chooseResult(result)}
                  >
                    <span className="search-result-heading">
                      <strong>{result.title}</strong>
                      <small>{result.sectionLabel}</small>
                    </span>
                    <span className="search-result-snippet">
                      <HighlightMatches
                        text={result.snippet}
                        terms={result.matchedTerms}
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

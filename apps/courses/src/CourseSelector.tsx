import { useMemo, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  formatBibleReference,
  parseBibleReference,
  type BibleReference,
} from "./bibleReferences";
import { courseLibrary, type HydratedLesson } from "./courseData";
import { LessonList } from "./LessonList";

type SelectorMode = "book" | "section" | "direct";

interface DirectSuggestion {
  label: string;
  detail: string;
  path: string;
}

function getLessonStartReference(lesson: HydratedLesson): BibleReference | null {
  if (lesson.lessonKind === "intro") {
    return {
      bookSlug: lesson.bookSlug,
      chapter: 1,
      verse: 0,
    };
  }

  const start = lesson.passage?.start;

  if (!start) {
    return null;
  }

  return {
    bookSlug: lesson.bookSlug,
    chapter: start.chapter,
    verse: start.verse,
  };
}

function buildDirectSuggestions() {
  const suggestions: DirectSuggestion[] = [];

  for (const book of courseLibrary.books) {
    suggestions.push({
      label: book.name,
      detail: `${book.lessons.length} ${
        book.lessons.length === 1 ? "lesson" : "lessons"
      }`,
      path: book.lessons[0]?.canonicalPath || `/${book.slug}`,
    });
  }

  for (const lesson of courseLibrary.allLessons) {
    const reference = getLessonStartReference(lesson);

    if (!reference) {
      continue;
    }

    suggestions.push({
      label:
        lesson.lessonKind === "intro"
          ? `${lesson.bookName} introduction`
          : formatBibleReference(reference),
      detail: lesson.title,
      path: lesson.canonicalPath,
    });
  }

  return suggestions;
}

const DIRECT_SUGGESTIONS = buildDirectSuggestions();

function modeHref(mode: SelectorMode) {
  if (mode === "section") {
    return `/?view=section&section=${
      courseLibrary.courseSections.find((section) => section.available)?.sectionnum ||
      courseLibrary.courseSections[0]?.sectionnum ||
      1
    }`;
  }

  if (mode === "direct") {
    return "/?view=direct";
  }

  return `/?view=book&book=${courseLibrary.books[0]?.slug || ""}`;
}

function SelectorTabs({ activeMode }: { activeMode: SelectorMode }) {
  const modes: Array<{ mode: SelectorMode; label: string }> = [
    { mode: "book", label: "Book" },
    { mode: "section", label: "Section" },
    { mode: "direct", label: "Direct" },
  ];

  return (
    <div className="selector-tabs" aria-label="Course navigation mode">
      {modes.map(({ mode, label }, index) => (
        <span key={mode} className="selector-tab-slot">
          {index > 0 ? <span aria-hidden="true">|</span> : null}
          {mode === activeMode ? (
            <span className="selector-tab selector-tab-active" aria-current="page">
              {label}
            </span>
          ) : (
            <Link className="selector-tab selector-tab-link" to={modeHref(mode)}>
              {label}
            </Link>
          )}
        </span>
      ))}
    </div>
  );
}

function DirectSelector() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [message, setMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    const parsedReference = parseBibleReference(query);
    const resolvedLesson = parsedReference
      ? courseLibrary.resolveReference(parsedReference)
      : null;
    const exactSuggestion = parsedReference && resolvedLesson
      ? {
          label: formatBibleReference(parsedReference),
          detail: `Opens ${resolvedLesson.title}`,
          path: resolvedLesson.canonicalPath,
        }
      : null;
    const matchingSuggestions = DIRECT_SUGGESTIONS.filter((suggestion) => {
      const searchText = `${suggestion.label} ${suggestion.detail} ${suggestion.path}`
        .toLowerCase();
      return searchText.includes(normalizedQuery);
    });
    const combined = exactSuggestion
      ? [exactSuggestion, ...matchingSuggestions]
      : matchingSuggestions;
    const seenPaths = new Set<string>();

    return combined
      .filter((suggestion) => {
        if (seenPaths.has(suggestion.path)) {
          return false;
        }
        seenPaths.add(suggestion.path);
        return true;
      })
      .slice(0, 8);
  }, [normalizedQuery, query]);

  function goToReference() {
    const parsedReference = parseBibleReference(query);
    const lesson = parsedReference
      ? courseLibrary.resolveReference(parsedReference)
      : null;

    if (!lesson) {
      setMessage("No course lesson matches that reference yet.");
      return;
    }

    navigate(lesson.canonicalPath);
  }

  function chooseSuggestion(suggestion: DirectSuggestion) {
    setMessage("");
    setIsOpen(false);
    navigate(suggestion.path);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        current >= suggestions.length - 1 ? 0 : current + 1
      );
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1
      );
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const activeSuggestion = suggestions[activeIndex];
      if (activeSuggestion) {
        chooseSuggestion(activeSuggestion);
      } else {
        goToReference();
      }
    }
  }

  return (
    <div className="direct-selector">
      <label htmlFor="direct-reference">Bible reference</label>
      <div className="direct-input-row">
        <input
          id="direct-reference"
          role="combobox"
          type="text"
          value={query}
          placeholder="Genesis 1:24"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls="direct-reference-suggestions"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-activedescendant={
            activeIndex >= 0 ? `direct-suggestion-${activeIndex}` : undefined
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
            setMessage("");
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="button button-primary"
          onClick={goToReference}
        >
          Go
        </button>
      </div>
      {isOpen && suggestions.length > 0 ? (
        <ul
          className="autocomplete-results"
          id="direct-reference-suggestions"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.path}-${suggestion.label}`}
              role="presentation"
            >
              <button
                type="button"
                id={`direct-suggestion-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseSuggestion(suggestion)}
              >
                <strong>{suggestion.label}</strong>
                <span>{suggestion.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p className="selector-message">{message}</p> : null}
      <p className="direct-help">
        Enter a book, chapter, or verse. Try “Genesis”, “Genesis 1”, or
        “Genesis 1:24”.
      </p>
    </div>
  );
}

export function CourseSelector() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMode = searchParams.get("view");
  const activeMode: SelectorMode =
    requestedMode === "section" || requestedMode === "direct"
      ? requestedMode
      : "book";
  const defaultBookSlug =
    courseLibrary.latestVideoLesson?.bookSlug ||
    courseLibrary.books[0]?.slug ||
    "";
  const selectedBook =
    courseLibrary.getBook(searchParams.get("book") || defaultBookSlug) ||
    courseLibrary.getBook(defaultBookSlug);
  const firstAvailableSection =
    courseLibrary.courseSections.find((section) => section.available) ||
    courseLibrary.courseSections[0];
  const requestedSectionNumber = Number.parseInt(
    searchParams.get("section") || "",
    10
  );
  const selectedSection =
    courseLibrary.getCourseSection(requestedSectionNumber) ||
    firstAvailableSection ||
    null;

  return (
    <>
      <div className="book-chooser course-selector">
        <div className="selector-control">
          <SelectorTabs activeMode={activeMode} />

          {activeMode === "book" && selectedBook ? (
            <label htmlFor="book-select">
              <span className="visually-hidden">Book</span>
              <select
                id="book-select"
                value={selectedBook.slug}
                onChange={(event) =>
                  setSearchParams({
                    view: "book",
                    book: event.target.value,
                  })
                }
              >
                {courseLibrary.books.map((book) => (
                  <option key={book.slug} value={book.slug}>
                    {book.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {activeMode === "section" && selectedSection ? (
            <label htmlFor="section-select">
              <span className="visually-hidden">Section</span>
              <select
                id="section-select"
                value={selectedSection.sectionnum}
                onChange={(event) =>
                  setSearchParams({
                    view: "section",
                    section: event.target.value,
                  })
                }
              >
                {courseLibrary.courseSections.map((section) => (
                  <option key={section.sectionnum} value={section.sectionnum}>
                    Section {section.sectionnum} — {section.rangeLabel}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {activeMode === "direct" ? <DirectSelector /> : null}
        </div>

        {activeMode === "book" && selectedBook ? (
          <p>
            <strong>{selectedBook.name}</strong>
            <span>
              {selectedBook.lessons.length}{" "}
              {selectedBook.lessons.length === 1 ? "lesson" : "lessons"}
            </span>
          </p>
        ) : null}

        {activeMode === "section" && selectedSection ? (
          <div className="section-selection-summary">
            <strong>{selectedSection.title}</strong>
            <span>{selectedSection.periodLabel}</span>
            <small>{selectedSection.descriptors.join(" · ")}</small>
          </div>
        ) : null}
      </div>

      {activeMode === "book" && selectedBook ? (
        <LessonList
          lessons={selectedBook.lessons}
          label={`${selectedBook.name} lessons`}
        />
      ) : null}

      {activeMode === "section" && selectedSection ? (
        selectedSection.lessonsDetailed.length > 0 ? (
          <LessonList
            lessons={selectedSection.lessonsDetailed}
            label={`Section ${selectedSection.sectionnum}: ${selectedSection.title} lessons`}
          />
        ) : (
          <div className="section-forthcoming">
            <p className="eyebrow">Forthcoming</p>
            <p>
              Lessons for {selectedSection.rangeLabel} will appear here as the
              course reaches this section.
            </p>
          </div>
        )
      ) : null}
    </>
  );
}

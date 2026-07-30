import { Suspense, lazy, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { parseBibleReference } from "./bibleReferences";
import { CourseSelector } from "./CourseSelector";
import { HeaderSearch } from "./HeaderSearch";
import { HomeBillboard } from "./HomeBillboard";
import {
  courseLibrary,
  formatLessonSequenceLabel,
  loadMarkdownContent,
  type HydratedLesson,
} from "./courseData";
import { getSiteBasePath, sitePath } from "./routerBase";
import {
  getToolsForLesson,
  toolCatalog,
  transformLessonNotes,
} from "./tools";
import { VideoPlayer } from "./VideoPlayer";

const LessonMapPanel = lazy(() => import("./LessonMapPanel"));

type MarkdownLoadState = {
  status: "idle" | "loading" | "loaded" | "error";
  markdown: string | null;
};

type ResolvedResource = HydratedLesson["resolvedResources"][number];

const IMAGE_RESOURCE_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)$/iu;

function bookPath(bookSlug: string) {
  return `/?view=book&book=${encodeURIComponent(bookSlug)}`;
}


function formatResourceName(name: string) {
  return name
    .replace(/\.[^.]+$/u, "")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function getResourceType(name: string) {
  const nameParts = name.split(".");
  return nameParts[nameParts.length - 1]?.toUpperCase() || "FILE";
}

function isImageResource(resource: ResolvedResource) {
  return IMAGE_RESOURCE_PATTERN.test(resource.name);
}

function extractStorylineTitle(markdown: string | null) {
  if (!markdown) {
    return null;
  }

  const titleLine = markdown
    .split("\n")
    .find((line) => /^\s*\*{2}Title:/iu.test(line));

  if (!titleLine) {
    return null;
  }

  const title = titleLine
    .replace(/^\s*\*{2}Title:\*{0,2}\s*/iu, "")
    .replace(/^\*{2}/u, "")
    .replace(/\*{2}\s*$/u, "")
    .trim();

  return title || null;
}

function getStorylineBody(markdown: string | null) {
  if (!markdown) {
    return null;
  }

  const body = markdown
    .split("\n")
    .filter(
      (line) =>
        !/^\s*\*{2}(?:Summary|Title|Storyline Summary):/iu.test(line)
    )
    .join("\n")
    .trim();

  return body || null;
}

export function getLessonPageContent({
  lesson,
  notesState,
  storylineState,
}: {
  lesson: HydratedLesson;
  notesState: MarkdownLoadState;
  storylineState: MarkdownLoadState;
}) {
  const storylineTitle =
    lesson.videoSummary || extractStorylineTitle(storylineState.markdown);
  const storylineBody =
    storylineState.status === "loaded"
      ? getStorylineBody(storylineState.markdown)
      : null;
  const lessonNotes =
    notesState.status === "loaded" && notesState.markdown
      ? transformLessonNotes(notesState.markdown) || null
      : null;

  return {
    storylineTitle,
    storylineBody,
    lessonNotes,
    hasVideo: Boolean(lesson.youtube),
    hasSummaries: Boolean(storylineBody),
    hasMap: Boolean(lesson.resolvedMap),
    hasActions: Boolean(lesson.passage?.esvUrl || lesson.youtube),
  };
}

function MarkdownBlock({ markdown }: { markdown: string }) {
  return (
    <div className="markdown-block">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            const isExternal = Boolean(href && /^https?:\/\//u.test(href));
            return (
              <a
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noreferrer" : undefined}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function SiteHeader() {
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const latestLesson = courseLibrary.latestVideoLesson;
  const lesson = courseLibrary.getLessonByCanonicalPath(location.pathname);
  const sequenceLabel = lesson
    ? formatLessonSequenceLabel(lesson)
    : null;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="brand-block">
          <p className="organization-name">Fulton Baptist Temple</p>
          <Link className="brand-link" to="/">
            Know Your Bible
          </Link>
          <p className="brand-tagline">
            Reading through the Bible start to finish, with context.
          </p>
        </div>
        <button
          ref={menuButtonRef}
          className="header-menu-toggle"
          type="button"
          aria-controls="mobile-primary-menu"
          aria-expanded={mobileMenuOpen}
          aria-label={
            mobileMenuOpen
              ? "Close site navigation"
              : "Open site navigation"
          }
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path d="m5 5 14 14M19 5 5 19" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
        <div
          className={`header-actions${
            mobileMenuOpen ? " header-actions-open" : ""
          }`}
          id="mobile-primary-menu"
        >
          <HeaderSearch />
          <nav className="site-nav" aria-label="Primary">
            <Link to="/" onClick={() => setMobileMenuOpen(false)}>
              Course
            </Link>
            {latestLesson ? (
              <Link
                to={latestLesson.canonicalPath}
                onClick={() => setMobileMenuOpen(false)}
              >
                Latest lesson
              </Link>
            ) : null}
            <Link
              to="/tools"
              onClick={() => setMobileMenuOpen(false)}
            >
              Tools
            </Link>
          </nav>
        </div>
      </div>
      {lesson && sequenceLabel ? (
        <nav className="header-context breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Course</Link>
          {lesson.lessonKind !== "promo" ? (
            <>
              <span aria-hidden="true">/</span>
              <Link to={bookPath(lesson.bookSlug)}>{lesson.bookName}</Link>
            </>
          ) : null}
          <span aria-hidden="true">/</span>
          <span>{sequenceLabel}</span>
        </nav>
      ) : null}
    </header>
  );
}

function LegacyLessonRedirect() {
  const { sectionSlug, lessonSlug } = useParams();
  const lesson =
    sectionSlug && lessonSlug
      ? courseLibrary.getLesson(sectionSlug, lessonSlug)
      : null;

  return lesson ? (
    <Navigate replace to={lesson.canonicalPath} />
  ) : (
    <NotFoundPage />
  );
}

function ReferenceLessonRoute() {
  const { bookSlug, chapter, verse } = useParams();
  const location = useLocation();
  const reference = parseBibleReference(
    [bookSlug, chapter, verse].filter(Boolean).join("/")
  );
  const lesson = reference ? courseLibrary.resolveReference(reference) : null;

  if (!lesson) {
    return <NotFoundPage />;
  }

  if (location.pathname !== lesson.canonicalPath) {
    return <Navigate replace to={lesson.canonicalPath} />;
  }

  return <LessonPage key={lesson.id} lesson={lesson} />;
}

function useMarkdownContent(
  contentPath: string | null | undefined
): MarkdownLoadState {
  const [state, setState] = useState<MarkdownLoadState>({
    status: contentPath ? "loading" : "idle",
    markdown: null,
  });

  useEffect(() => {
    let isCancelled = false;

    if (!contentPath) {
      setState({
        status: "idle",
        markdown: null,
      });
      return () => {
        isCancelled = true;
      };
    }

    setState({
      status: "loading",
      markdown: null,
    });

    loadMarkdownContent(contentPath)
      .then((markdown) => {
        if (isCancelled) {
          return;
        }

        setState({
          status: markdown ? "loaded" : "error",
          markdown,
        });
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setState({
          status: "error",
          markdown: null,
        });
      });

    return () => {
      isCancelled = true;
    };
  }, [contentPath]);

  return state;
}


function HomePage() {

  return (
    <div className="home-page">
      <HomeBillboard lessons={courseLibrary.billboardLessons} />

      <section className="library-section" id="course-library">
        <div className="section-intro">
          <div>
            <p className="eyebrow">Course library</p>
            <h2>Choose how to explore</h2>
          </div>
          <p>
            Work through every lesson in order, or return directly to the passage
            you are studying.
          </p>
        </div>

        <CourseSelector />
      </section>
    </div>
  );
}

function SectionRedirect() {
  const { sectionSlug } = useParams();
  const section = sectionSlug ? courseLibrary.getSection(sectionSlug) : null;

  return (
    <Navigate
      replace
      to={section ? `/?view=section&section=${section.sectionnum}` : "/"}
    />
  );
}

function LessonResources({ lesson }: { lesson: HydratedLesson }) {
  const imageResources = lesson.resolvedResources.filter(isImageResource);
  const fileResources = lesson.resolvedResources.filter(
    (resource) => !isImageResource(resource)
  );

  if (imageResources.length === 0 && fileResources.length === 0) {
    return null;
  }

  return (
    <section className="lesson-section resources-section">
      <div className="section-title">
        <p className="eyebrow">Further study</p>
        <h2>Resources from this lesson</h2>
      </div>

      {imageResources.length > 0 ? (
        <div className="resource-gallery">
          {imageResources.map((resource) => (
            <figure key={resource.path} className="resource-image">
              <a
                className="resource-asset-link"
                href={resource.href}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={resource.href}
                  alt={formatResourceName(resource.name)}
                  loading="lazy"
                />
              </a>
              <figcaption>
                <span>{formatResourceName(resource.name)}</span>
                {resource.sourceUrl ? (
                  <a
                    className="resource-source"
                    href={resource.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source
                  </a>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {fileResources.length > 0 ? (
        <ul className="resource-downloads">
          {fileResources.map((resource) => (
            <li key={resource.path}>
              <a
                className="resource-download"
                href={resource.href}
                target="_blank"
                rel="noreferrer"
              >
                <span>{formatResourceName(resource.name)}</span>
                <small>{getResourceType(resource.name)}</small>
              </a>
              {resource.sourceUrl ? (
                <a
                  className="resource-source"
                  href={resource.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function LessonTools({ lesson }: { lesson: HydratedLesson }) {
  const tools = getToolsForLesson(lesson.id);

  if (tools.length === 0) {
    return null;
  }

  return (
    <aside className="lesson-tools" aria-label="Related lesson tools">
      <strong>Tools</strong>
      <span aria-hidden="true">·</span>
      <div>
        {tools.map((tool) => (
          <a key={tool.path} href={sitePath(tool.path)}>
            {tool.title}
          </a>
        ))}
      </div>
    </aside>
  );
}

function NotesPanel({ markdown }: { markdown: string }) {
  return (
    <section className="study-panel notes-panel standalone-study-panel">
      <div className="section-title">
        <p className="eyebrow">Commentary</p>
        <h2>Lesson notes</h2>
      </div>
      <MarkdownBlock markdown={markdown} />
    </section>
  );
}

function LessonPage({ lesson }: { lesson: HydratedLesson }) {
  const notesState = useMarkdownContent(lesson?.notes.path);
  const storylineState = useMarkdownContent(lesson?.summary.path);
  useEffect(() => {
    for (const [label, state, available] of [
      ["lesson notes", notesState, lesson.notes.available],
      ["storyline summary", storylineState, lesson.summary.available],
    ] as const) {
      if (available && state.status === "error") {
        console.error(`Unable to load ${label} for "${lesson.title}".`);
      }
    }
  }, [
    lesson.notes.available,
    lesson.summary.available,
    lesson.title,
    notesState,
    storylineState,
  ]);

  const adjacentLessons = courseLibrary.getAdjacentLessons(
    lesson.sectionSlug,
    lesson.slug
  );
  const content = getLessonPageContent({
    lesson,
    notesState,
    storylineState,
  });

  return (
    <article className="lesson-page">
      <header className="lesson-header">
        <h1>{lesson.title}</h1>
        {content.storylineTitle ? (
          <p className="lesson-tagline">{content.storylineTitle}</p>
        ) : null}
        {content.hasActions ? (
          <div className="lesson-actions">
            {lesson.passage?.esvUrl ? (
              <a
                className="button button-primary"
                href={lesson.passage.esvUrl}
                target="_blank"
                rel="noreferrer"
              >
                Read {lesson.passage.display} in ESV
              </a>
            ) : null}
            {lesson.youtube ? (
              <a
                className="text-link"
                href={lesson.youtube.url}
                target="_blank"
                rel="noreferrer"
              >
                Watch on YouTube
              </a>
            ) : null}
          </div>
        ) : null}
      </header>
      {content.hasVideo ? (
        <section className="lesson-video" aria-label="Lesson video">
          <VideoPlayer lesson={lesson} eager />
        </section>
      ) : null}

      {content.hasSummaries ? (
        <div className="summary-grid">
          {content.storylineBody ? (
            <section className="lesson-section summary-card storyline-section">
              <div className="section-title">
                <p className="eyebrow">From the class</p>
                <h2>Storyline summary</h2>
              </div>
              <MarkdownBlock markdown={content.storylineBody} />
            </section>
          ) : null}
        </div>
      ) : null}
      <LessonTools lesson={lesson} />

      {content.hasMap && lesson.resolvedMap ? (
        <Suspense fallback={null}>
          <LessonMapPanel lessonTitle={lesson.title} map={lesson.resolvedMap} />
        </Suspense>
      ) : null}

      {content.lessonNotes ? (
        <NotesPanel markdown={content.lessonNotes} />
      ) : null}

      <LessonResources lesson={lesson} />

      <nav className="lesson-pagination" aria-label="Adjacent lessons">
        <div>
          {adjacentLessons.previous ? (
            <>
              <span>Previous</span>
              <Link to={adjacentLessons.previous.canonicalPath}>
                ← {adjacentLessons.previous.title}
              </Link>
            </>
          ) : null}
        </div>
        <div>
          {adjacentLessons.next ? (
            <>
              <span>Next</span>
              <Link to={adjacentLessons.next.canonicalPath}>
                {adjacentLessons.next.title} →
              </Link>
            </>
          ) : null}
        </div>
      </nav>
    </article>
  );
}

function ToolsPage() {
  return (
    <section className="tools-page">
      <header className="tools-hero">
        <p className="eyebrow">Interactive study</p>
        <h1>Lesson tools</h1>
        <p>
          Open visual guides and interactive references, then return to the
          lessons where they are used.
        </p>
        <Link className="button button-primary" to="/">
          Back to Courses
        </Link>
      </header>

      {toolCatalog.length > 0 ? (
        <div className="tools-grid">
          {toolCatalog.map((tool) => {
            const relatedLessons = tool.relatedLessonIds
              .map((lessonId) => courseLibrary.getLessonById(lessonId))
              .filter((lesson): lesson is HydratedLesson => Boolean(lesson));

            return (
              <article key={tool.path} className="tool-card">
                <p className="eyebrow">Study tool</p>
                <h2>
                  <a href={sitePath(tool.path)}>{tool.title}</a>
                </h2>
                <a className="tool-open-link" href={sitePath(tool.path)}>
                  Open tool →
                </a>
                {relatedLessons.length > 0 ? (
                  <div className="tool-lessons">
                    <strong>Related lessons</strong>
                    <ul>
                      {relatedLessons.map((lesson) => (
                        <li key={lesson.id}>
                          <Link to={lesson.canonicalPath}>{lesson.title}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-state">No lesson tools are published yet.</p>
      )}
    </section>
  );
}

function NotFoundPage() {
  return (
    <section className="not-found">
      <p className="eyebrow">Not found</p>
      <h1>That lesson is not available.</h1>
      <p>
        The link may be out of date, or the course content is still being
        prepared.
      </p>
      <Link className="button button-primary" to="/">
        Return to the course
      </Link>
    </section>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={getSiteBasePath() || undefined}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-shell">
        <SiteHeader />

        <main className="page-shell" id="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/sections/:sectionSlug" element={<SectionRedirect />} />
            <Route
              path="/lessons/:sectionSlug/:lessonSlug"
              element={<LegacyLessonRedirect />}
            />
            <Route path="/:bookSlug" element={<ReferenceLessonRoute />} />
            <Route path="/:bookSlug/:chapter" element={<ReferenceLessonRoute />} />
            <Route
              path="/:bookSlug/:chapter/:verse"
              element={<ReferenceLessonRoute />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>

        <footer className="site-footer">
          <div>
            <strong>Know Your Bible</strong>
            <span>Videos, commentary, and resources from Genesis onward.</span>
          </div>
          <a href="https://fultonbaptist.org/" target="_blank" rel="noreferrer">
            Fulton Baptist Temple
          </a>
        </footer>
      </div>
    </BrowserRouter>
  );
}

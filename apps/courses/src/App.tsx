import { Suspense, lazy, useEffect, useState } from "react";
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
import {
  courseLibrary,
  loadMarkdownContent,
  type HydratedLesson,
} from "./courseData";
import { getSiteBasePath, sitePath } from "./routerBase";

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

function getYoutubeEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    videoId
  )}?rel=0`;
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
  notesSummaryState,
  storylineState,
}: {
  lesson: HydratedLesson;
  notesState: MarkdownLoadState;
  notesSummaryState: MarkdownLoadState;
  storylineState: MarkdownLoadState;
}) {
  const storylineTitle = extractStorylineTitle(storylineState.markdown);
  const storylineBody =
    storylineState.status === "loaded"
      ? getStorylineBody(storylineState.markdown)
      : null;
  const notesSummary =
    notesSummaryState.status === "loaded"
      ? notesSummaryState.markdown?.trim() || null
      : null;
  const lessonNotes =
    notesState.status === "loaded" ? notesState.markdown?.trim() || null : null;

  return {
    storylineTitle,
    storylineBody,
    notesSummary,
    lessonNotes,
    hasVideo: Boolean(lesson.youtube),
    hasSummaries: Boolean(notesSummary || storylineBody),
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
  const latestLesson = courseLibrary.latestVideoLesson;
  const lesson = courseLibrary.getLessonByCanonicalPath(location.pathname);
  const weekNumber = lesson
    ? lesson.youtube?.weekNumber ??
      lesson.youtube?.position ??
      lesson.sequenceNumber
    : null;

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
        <div className="header-actions">
          <HeaderSearch />
          <nav className="site-nav" aria-label="Primary">
            <Link to="/">Course</Link>
            {latestLesson ? (
              <Link to={latestLesson.canonicalPath}>
                Latest lesson
              </Link>
            ) : null}
            <a href={sitePath("/tools/")}>Tools</a>
          </nav>
        </div>
      </div>
      {lesson && weekNumber !== null ? (
        <nav className="header-context breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Course</Link>
          <span aria-hidden="true">/</span>
          <Link to={bookPath(lesson.bookSlug)}>{lesson.bookName}</Link>
          <span aria-hidden="true">/</span>
          <span>Week {weekNumber}</span>
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

function VideoPlayer({
  lesson,
  eager = false,
}: {
  lesson: HydratedLesson;
  eager?: boolean;
}) {
  if (!lesson.youtube) {
    return (
      <div className="video-placeholder">
        <span>Video coming soon</span>
        <p>This lesson is ready to read while the class recording is prepared.</p>
      </div>
    );
  }

  return (
    <div className="video-frame">
      <iframe
        src={getYoutubeEmbedUrl(lesson.youtube.videoId)}
        title={`${lesson.title} course video`}
        loading={eager ? "eager" : "lazy"}
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}


function HomePage() {
  const latestLesson = courseLibrary.latestVideoLesson;

  return (
    <div className="home-page">
      {latestLesson ? (
        <section className="billboard" aria-labelledby="latest-lesson-title">
          <div className="billboard-media">
            <VideoPlayer lesson={latestLesson} eager />
          </div>
          <div className="billboard-copy">
            <p className="eyebrow">Latest course</p>
            <h1 id="latest-lesson-title">{latestLesson.title}</h1>
            <p className="billboard-description">
              Follow the Bible’s storyline in order, with the historical and
              literary context that makes each passage easier to understand.
            </p>
            <div className="billboard-meta">
              <span>
                Week{" "}
                {latestLesson.youtube?.weekNumber ??
                  latestLesson.youtube?.position ??
                  latestLesson.sequenceNumber}
              </span>
              {latestLesson.youtube?.durationText ? (
                <span>{latestLesson.youtube.durationText}</span>
              ) : null}
            </div>
            <div className="button-row">
              <Link
                className="button button-primary"
                to={latestLesson.canonicalPath}
              >
                Explore this lesson
              </Link>
              {latestLesson.passage?.esvUrl ? (
                <a
                  className="button button-quiet"
                  href={latestLesson.passage.esvUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Read in ESV
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section className="billboard billboard-empty">
          <div>
            <p className="eyebrow">Know Your Bible</p>
            <h1>Start at the beginning.</h1>
            <p className="billboard-description">
              Course videos will appear here as they are published.
            </p>
          </div>
        </section>
      )}

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
      to={
        section
          ? `/?view=section&section=${section.sectionnum}`
          : "/"
      }
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
        <h2>Resources from this week</h2>
      </div>

      {imageResources.length > 0 ? (
        <div className="resource-gallery">
          {imageResources.map((resource) => (
            <figure key={resource.path} className="resource-image">
              <a href={resource.href} target="_blank" rel="noreferrer">
                <img
                  src={resource.href}
                  alt={formatResourceName(resource.name)}
                  loading="lazy"
                />
              </a>
              <figcaption>{formatResourceName(resource.name)}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {fileResources.length > 0 ? (
        <ul className="resource-downloads">
          {fileResources.map((resource) => (
            <li key={resource.path}>
              <a href={resource.href} target="_blank" rel="noreferrer">
                <span>{formatResourceName(resource.name)}</span>
                <small>{getResourceType(resource.name)}</small>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function NotesPanel({
  markdown,
}: {
  markdown: string;
}) {
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
  const notesSummaryState = useMarkdownContent(lesson?.notesSummary?.path);
  const storylineState = useMarkdownContent(lesson?.summary.path);
  useEffect(() => {
    for (const [label, state, available] of [
      ["lesson notes", notesState, lesson.notes.available],
      [
        "notes summary",
        notesSummaryState,
        Boolean(lesson.notesSummary?.available),
      ],
      ["storyline summary", storylineState, lesson.summary.available],
    ] as const) {
      if (available && state.status === "error") {
        console.error(`Unable to load ${label} for "${lesson.title}".`);
      }
    }
  }, [
    lesson.notes.available,
    lesson.notesSummary?.available,
    lesson.summary.available,
    lesson.title,
    notesState,
    notesSummaryState,
    storylineState,
  ]);

  const adjacentLessons = courseLibrary.getAdjacentLessons(
    lesson.sectionSlug,
    lesson.slug
  );
  const content = getLessonPageContent({
    lesson,
    notesState,
    notesSummaryState,
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
          {content.notesSummary ? (
            <section className="lesson-section summary-card notes-summary">
              <div className="section-title">
                <p className="eyebrow">At a glance</p>
                <h2>Summary of the notes</h2>
              </div>
              <MarkdownBlock markdown={content.notesSummary} />
            </section>
          ) : null}
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
              <Link
                to={adjacentLessons.previous.canonicalPath}
              >
                ← {adjacentLessons.previous.title}
              </Link>
            </>
          ) : null}
        </div>
        <div>
          {adjacentLessons.next ? (
            <>
              <span>Next</span>
              <Link
                to={adjacentLessons.next.canonicalPath}
              >
                {adjacentLessons.next.title} →
              </Link>
            </>
          ) : null}
        </div>
      </nav>
    </article>
  );
}

function NotFoundPage() {
  return (
    <section className="not-found">
      <p className="eyebrow">Not found</p>
      <h1>That lesson is not available.</h1>
      <p>The link may be out of date, or the course content is still being prepared.</p>
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

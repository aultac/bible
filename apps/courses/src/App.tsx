import { Suspense, lazy, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  HashRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import {
  courseLibrary,
  loadMarkdownContent,
  type HydratedSection,
  type HydratedLesson,
} from "./courseData";

const LessonMapPanel = lazy(() => import("./LessonMapPanel"));

function formatStatusLabel(status: string) {
  return status.replace(/-/gu, " ");
}

function lessonPath(sectionSlug: string, lessonSlug: string) {
  return `/lessons/${sectionSlug}/${lessonSlug}`;
}

function sectionPath(sectionSlug: string) {
  return `/sections/${sectionSlug}`;
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

type MarkdownLoadState = {
  status: "idle" | "loading" | "loaded" | "error";
  markdown: string | null;
};

function useMarkdownContent(contentPath: string | null | undefined): MarkdownLoadState {
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${status}`}>
      {formatStatusLabel(status)}
    </span>
  );
}

function LessonSummaryCard({
  section,
  lesson,
}: {
  section: HydratedSection;
  lesson: HydratedLesson;
}) {
  return (
    <article className="lesson-card">
      <div className="lesson-card-topline">
        <span className="lesson-sequence">
          Lesson {String(lesson.sequenceNumber).padStart(3, "0")}
        </span>
        <StatusBadge status={lesson.status} />
      </div>
      <h3>{lesson.title}</h3>
      <p className="lesson-card-copy">
        {lesson.lessonKind === "intro"
          ? "Introduction and framing material for this section."
          : `Passage focus: ${lesson.passage?.display}`}
      </p>
      <div className="pill-row">
        <span className="pill">{lesson.notes.available ? "Notes" : "No notes yet"}</span>
        <span className="pill">
          {lesson.summary.available ? "Summary" : "Summary pending"}
        </span>
        <span className="pill">
          {lesson.youtube ? "Video linked" : "Video pending"}
        </span>
        {lesson.resolvedMap ? <span className="pill">Map</span> : null}
        <span className="pill">{lesson.resources.length} resources</span>
      </div>
      <div className="card-actions">
        <Link className="button-link" to={lessonPath(section.slug, lesson.slug)}>
          Open lesson
        </Link>
        {lesson.passage?.esvUrl ? (
          <a
            className="subtle-link"
            href={lesson.passage.esvUrl}
            target="_blank"
            rel="noreferrer"
          >
            Read on ESV
          </a>
        ) : null}
      </div>
    </article>
  );
}

function SectionCard({ section }: { section: HydratedSection }) {
  return (
    <article className="section-card">
      <div className="section-card-topline">
        <span className="section-label">Section {section.sectionnum}</span>
        <StatusBadge status={section.status} />
      </div>
      <h3>{section.title}</h3>
      <p className="section-card-copy">
        {section.info ||
          "Narrative section organizing the course by storyline and passage progression."}
      </p>
      <div className="pill-row">
        <span className="pill">{section.lessonCount} lessons</span>
        {section.passage?.display ? <span className="pill">{section.passage.display}</span> : null}
      </div>
      {section.latestLesson ? (
        <p className="section-latest">
          Latest: <strong>{section.latestLesson.title}</strong>
        </p>
      ) : null}
      <div className="card-actions">
        <Link className="button-link" to={sectionPath(section.slug)}>
          Open section
        </Link>
      </div>
    </article>
  );
}

function HomePage() {
  const latestLesson = courseLibrary.latestLesson;
  const currentSection = courseLibrary.currentSection;
  const startHereLesson = courseLibrary.startHereLesson;

  return (
    <>
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Verse-by-verse Sunday School archive</p>
          <h1>Study the course by section, lesson, notes, and summary.</h1>
          <p className="hero-copy-text">
            This hub is organized around the major narrative sections of Scripture so
            newer listeners can start somewhere manageable while returning listeners can
            jump directly to the exact lesson or passage they want.
          </p>
          <div className="hero-actions">
            {latestLesson ? (
              <Link
                className="button-link"
                to={lessonPath(latestLesson.sectionSlug, latestLesson.slug)}
              >
                Open latest lesson
              </Link>
            ) : null}
            {startHereLesson ? (
              <Link
                className="button-link button-link-secondary"
                to={lessonPath(startHereLesson.sectionSlug, startHereLesson.slug)}
              >
                Start at the beginning
              </Link>
            ) : null}
          </div>
        </div>
        <div className="hero-meta">
          <div className="metric-card">
            <span className="metric-label">Sections available</span>
            <strong>{courseLibrary.sections.length}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Lessons synced</span>
            <strong>{courseLibrary.allLessons.length}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Last content sync</span>
            <strong>{new Date(courseLibrary.generatedAt).toLocaleDateString()}</strong>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card feature-card-primary">
          <p className="eyebrow">Latest</p>
          <h2>{latestLesson?.title || "No lesson synced yet"}</h2>
          <p>
            {latestLesson
              ? latestLesson.lessonKind === "intro"
                ? "Current entry point for the section."
                : `Current passage focus: ${latestLesson.passage?.display}`
              : "Run the course sync to populate lesson content."}
          </p>
          {latestLesson ? (
            <div className="card-actions">
              <Link
                className="button-link"
                to={lessonPath(latestLesson.sectionSlug, latestLesson.slug)}
              >
                Open lesson
              </Link>
              <Link className="subtle-link" to={sectionPath(latestLesson.sectionSlug)}>
                Open section
              </Link>
            </div>
          ) : null}
        </article>

        <article className="feature-card">
          <p className="eyebrow">Current section</p>
          <h2>{currentSection?.title || "No current section set"}</h2>
          <p>
            {currentSection?.passage?.display
              ? `Current storyline range: ${currentSection.passage.display}`
              : "Section summaries and narrative metadata will live here as the course grows."}
          </p>
          {currentSection ? (
            <div className="pill-row">
              <StatusBadge status={currentSection.status} />
              <span className="pill">{currentSection.lessonCount} lessons</span>
            </div>
          ) : null}
          {currentSection ? (
            <div className="card-actions">
              <Link className="button-link" to={sectionPath(currentSection.slug)}>
                Browse section
              </Link>
            </div>
          ) : null}
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sections</p>
            <h2>Navigate the course by narrative section</h2>
          </div>
          <p className="section-copy">
            Each section frames a coherent part of the storyline so the archive feels
            ordered instead of overwhelming.
          </p>
        </div>
        <div className="section-grid">
          {courseLibrary.sections.map((section) => (
            <SectionCard key={section.slug} section={section} />
          ))}
        </div>
      </section>
    </>
  );
}

function SectionPage() {
  const { sectionSlug } = useParams();
  const section = sectionSlug ? courseLibrary.getSection(sectionSlug) : null;
  const sectionSummaryState = useMarkdownContent(section?.sectionSummary.path);

  if (!section) {
    return <NotFoundPage />;
  }

  return (
    <>
      <section className="hero-panel hero-panel-compact">
        <div className="hero-copy">
          <Link className="subtle-link" to="/">
            ← Back home
          </Link>
          <p className="eyebrow">Section {section.sectionnum}</p>
          <h1>{section.title}</h1>
          <p className="hero-copy-text">
            {section.info ||
              "This section groups lessons into a storyline range so students can browse by the larger biblical arc as well as by individual lesson."}
          </p>
          <div className="pill-row">
            <StatusBadge status={section.status} />
            {section.passage?.display ? <span className="pill">{section.passage.display}</span> : null}
            <span className="pill">{section.lessonCount} lessons</span>
          </div>
        </div>
        <div className="hero-meta">
          <div className="metric-card">
            <span className="metric-label">Latest lesson</span>
            <strong>{section.latestLesson?.title || "None yet"}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Section summary</span>
            <strong>{section.sectionSummary.available ? "Available" : "Not added yet"}</strong>
          </div>
        </div>
      </section>

      {section.sectionSummary.available ? (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Section summary</p>
              <h2>High-level orientation</h2>
            </div>
          </div>
          <div className="content-panel">
            {sectionSummaryState.status === "loaded" && sectionSummaryState.markdown ? (
              <MarkdownBlock markdown={sectionSummaryState.markdown} />
            ) : sectionSummaryState.status === "loading" ? (
              <p className="empty-state">Loading section summary…</p>
            ) : (
              <p className="empty-state">Section summary could not be loaded.</p>
            )}
          </div>
        </section>
      ) : null}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Lessons</p>
            <h2>{section.lessonCount} lessons in this section</h2>
          </div>
          <p className="section-copy">
            Open a lesson for the full notes, converted summary, and attached resources.
          </p>
        </div>
        <div className="lesson-grid">
          {section.lessonsDetailed.map((lesson) => (
            <LessonSummaryCard key={lesson.slug} section={section} lesson={lesson} />
          ))}
        </div>
      </section>
    </>
  );
}

function LessonPage() {
  const { sectionSlug, lessonSlug } = useParams();
  const lesson =
    sectionSlug && lessonSlug ? courseLibrary.getLesson(sectionSlug, lessonSlug) : null;
  const section = sectionSlug ? courseLibrary.getSection(sectionSlug) : null;
  const notesState = useMarkdownContent(lesson?.notes.path);
  const summaryState = useMarkdownContent(lesson?.summary.path);

  if (!lesson || !section) {
    return <NotFoundPage />;
  }

  const adjacentLessons = courseLibrary.getAdjacentLessons(section.slug, lesson.slug);

  return (
    <>
      <section className="hero-panel hero-panel-compact">
        <div className="hero-copy">
          <Link className="subtle-link" to={sectionPath(section.slug)}>
            ← Back to {section.title}
          </Link>
          <p className="eyebrow">
            Section {section.sectionnum} · Lesson {String(lesson.sequenceNumber).padStart(3, "0")}
          </p>
          <h1>{lesson.title}</h1>
          <p className="hero-copy-text">
            {lesson.description ||
              (lesson.lessonKind === "intro"
                ? "Introductory material for the section."
                : `Study notes and summary for ${lesson.passage?.display}.`)}
          </p>
          <div className="pill-row">
            <StatusBadge status={lesson.status} />
            {lesson.passage?.display ? <span className="pill">{lesson.passage.display}</span> : null}
            {lesson.youtube ? <span className="pill">Week {lesson.youtube.weekNumber ?? lesson.youtube.position ?? lesson.sequenceNumber}</span> : null}
            {lesson.resolvedMap ? <span className="pill">Map available</span> : null}
            <span className="pill">{lesson.resources.length} resources</span>
          </div>
          <div className="hero-actions">
            {lesson.youtube ? (
              <a
                className="button-link"
                href={lesson.youtube.url}
                target="_blank"
                rel="noreferrer"
              >
                Watch on YouTube
              </a>
            ) : null}
            {lesson.passage?.esvUrl ? (
              <a
                className={
                  lesson.youtube ? "button-link button-link-secondary" : "button-link"
                }
                href={lesson.passage.esvUrl}
                target="_blank"
                rel="noreferrer"
              >
                Read passage on ESV
              </a>
            ) : null}
          </div>
        </div>
        <div className="hero-meta">
          <div className="metric-card">
            <span className="metric-label">Notes</span>
            <strong>{lesson.notes.available ? "Available" : "Not synced yet"}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Summary</span>
            <strong>{lesson.summary.available ? "Available" : "Pending"}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Video link</span>
            <strong>
              {lesson.youtube
                ? `Week ${lesson.youtube.weekNumber ?? lesson.youtube.position ?? lesson.sequenceNumber}`
                : "Not linked yet"}
            </strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Map</span>
            <strong>{lesson.resolvedMap ? "Available" : "Not added yet"}</strong>
          </div>
        </div>
      </section>

      <nav className="adjacent-nav" aria-label="Adjacent lessons">
        <div>
          {adjacentLessons.previous ? (
            <Link
              className="subtle-link"
              to={lessonPath(
                adjacentLessons.previous.sectionSlug,
                adjacentLessons.previous.slug
              )}
            >
              ← {adjacentLessons.previous.title}
            </Link>
          ) : (
            <span className="nav-placeholder">Beginning of course</span>
          )}
        </div>
        <div>
          {adjacentLessons.next ? (
            <Link
              className="subtle-link"
              to={lessonPath(adjacentLessons.next.sectionSlug, adjacentLessons.next.slug)}
            >
              {adjacentLessons.next.title} →
            </Link>
          ) : (
            <span className="nav-placeholder">Latest lesson</span>
          )}
        </div>
      </nav>

      <section className="lesson-layout">
        <aside className="sidebar-stack">
          <article className="sidebar-card">
            <p className="eyebrow">Lesson details</p>
            <dl className="meta-list">
              <div>
                <dt>Section</dt>
                <dd>
                  <Link to={sectionPath(section.slug)}>{section.title}</Link>
                </dd>
              </div>
              <div>
                <dt>Kind</dt>
                <dd>{lesson.lessonKind}</dd>
              </div>
              <div>
                <dt>Start verse</dt>
                <dd>{lesson.startVerse || "—"}</dd>
              </div>
              <div>
                <dt>End verse</dt>
                <dd>{lesson.endVerse || "—"}</dd>
              </div>
            </dl>
          </article>

          <article className="sidebar-card">
            <p className="eyebrow">Video</p>
            <h2>{lesson.youtube?.title || "No matched video yet"}</h2>
            {lesson.youtube ? (
              <>
                <p className="sidebar-copy">
                  Matched automatically from the course playlist by week number.
                </p>
                <div className="card-actions">
                  <a
                    className="button-link button-link-secondary"
                    href={lesson.youtube.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open video
                  </a>
                </div>
                <dl className="meta-list">
                  <div>
                    <dt>Week</dt>
                    <dd>{lesson.youtube.weekNumber ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Playlist position</dt>
                    <dd>{lesson.youtube.position ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{lesson.youtube.durationText || "—"}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="sidebar-copy">
                No playlist video matches this lesson yet. Run `yarn courses:update`
                after the weekly upload lands.
              </p>
            )}
          </article>

          {lesson.resolvedMap ? (
            <Suspense
              fallback={
                <article className="sidebar-card">
                  <p className="eyebrow">Map</p>
                  <h2>Lesson geography</h2>
                  <p className="sidebar-copy">Loading lesson map…</p>
                </article>
              }
            >
              <LessonMapPanel lessonTitle={lesson.title} map={lesson.resolvedMap} />
            </Suspense>
          ) : null}

          <article className="sidebar-card">
            <p className="eyebrow">Resources</p>
            {lesson.resolvedResources.length > 0 ? (
              <ul className="resource-list">
                {lesson.resolvedResources.map((resource) => (
                  <li key={resource.path}>
                    <a href={resource.href} target="_blank" rel="noreferrer">
                      {resource.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sidebar-copy">No attached resources for this lesson yet.</p>
            )}
          </article>
        </aside>

        <div className="article-stack">
          <section className="content-panel">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Notes</p>
                <h2>Lesson notes</h2>
              </div>
            </div>
            {notesState.status === "loaded" && notesState.markdown ? (
              <MarkdownBlock markdown={notesState.markdown} />
            ) : lesson.notes.available && notesState.status === "loading" ? (
              <p className="empty-state">Loading lesson notes…</p>
            ) : lesson.notes.available ? (
              <p className="empty-state">Lesson notes could not be loaded.</p>
            ) : (
              <p className="empty-state">No notes synced for this lesson yet.</p>
            )}
          </section>

          <section className="content-panel">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Summary</p>
                <h2>Lesson summary</h2>
              </div>
            </div>
            {summaryState.status === "loaded" && summaryState.markdown ? (
              <MarkdownBlock markdown={summaryState.markdown} />
            ) : lesson.summary.available && summaryState.status === "loading" ? (
              <p className="empty-state">Loading lesson summary…</p>
            ) : lesson.summary.available ? (
              <p className="empty-state">Lesson summary could not be loaded.</p>
            ) : (
              <p className="empty-state">No summary has been converted for this lesson yet.</p>
            )}
          </section>
        </div>
      </section>
    </>
  );
}

function NotFoundPage() {
  return (
    <section className="empty-panel">
      <p className="eyebrow">Not found</p>
      <h1>That lesson or section isn’t available.</h1>
      <p>
        The URL may be stale, or the content may not have been generated yet.
      </p>
      <Link className="button-link" to="/">
        Return to courses home
      </Link>
    </section>
  );
}

export default function App() {
  const currentSection = courseLibrary.currentSection;
  const latestLesson = courseLibrary.latestLesson;

  return (
    <HashRouter>
      <div className="app-shell">
        <header className="site-header">
          <div className="brand-block">
            <p className="eyebrow">Fulton Baptist Temple</p>
            <Link className="brand-link" to="/">
              Sunday School Courses
            </Link>
            <p className="brand-copy">
              Section-first navigation for notes, summaries, and lesson resources.
            </p>
          </div>
          <nav className="top-nav" aria-label="Primary">
            <NavLink
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
              to="/"
              end
            >
              Home
            </NavLink>
            {currentSection ? (
              <NavLink
                className={({ isActive }) =>
                  isActive ? "nav-link nav-link-active" : "nav-link"
                }
                to={sectionPath(currentSection.slug)}
              >
                Current section
              </NavLink>
            ) : null}
            {latestLesson ? (
              <Link className="nav-link nav-link-emphasis" to={lessonPath(latestLesson.sectionSlug, latestLesson.slug)}>
                Latest lesson
              </Link>
            ) : null}
            <a className="nav-link" href="/">
              All tools
            </a>
          </nav>
        </header>

        <main className="page-shell">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/sections/:sectionSlug" element={<SectionPage />} />
            <Route path="/lessons/:sectionSlug/:lessonSlug" element={<LessonPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>

        <footer className="site-footer">
          <div>
            <p className="eyebrow">Footer</p>
            <p className="footer-copy">
              Lesson content is generated from the canonical course source tree and approved
              Apple Notes backups.
            </p>
          </div>
          <a href="https://fultonbaptist.org/" target="_blank" rel="noreferrer">
            Fulton Baptist Temple
          </a>
        </footer>
      </div>
    </HashRouter>
  );
}

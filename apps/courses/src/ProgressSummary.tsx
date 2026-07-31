import { Link } from "react-router-dom";
import { courseLibrary, type HydratedLesson } from "./courseData";
import { useProgress } from "./ProgressProvider";
import { getProgressStats, type ProgressStats } from "./progress";

function ProgressBar({
  label,
  stats,
  allCaughtUp = false,
}: {
  label: string;
  stats: ProgressStats;
  allCaughtUp?: boolean;
}) {
  return (
    <div className="course-progress-item">
      <div className="course-progress-label">
        <strong>{label}</strong>
        <span>
          {allCaughtUp && stats.allComplete
            ? "You're all caught up!"
            : `${stats.completed} of ${stats.total} · ${stats.percent}%`}
        </span>
      </div>
      <progress
        aria-label={`${label}: ${stats.percent}% complete`}
        max={Math.max(stats.total, 1)}
        value={stats.completed}
      >
        {stats.percent}%
      </progress>
    </div>
  );
}

export function ProgressSummary({
  scopeLabel,
  scopeLessons,
}: {
  scopeLabel: string | null;
  scopeLessons: readonly HydratedLesson[] | null;
}) {
  const { progress } = useProgress();
  const overallStats = getProgressStats(
    courseLibrary.trackableLessons,
    progress.completedLessons
  );
  if (overallStats.completed === 0) {
    return null;
  }

  const lastViewedLesson = progress.lastViewed
    ? courseLibrary.getLessonById(progress.lastViewed.lessonId)
    : null;
  const scopedStats =
    scopeLabel && scopeLessons
      ? getProgressStats(
          scopeLessons.filter((lesson) => lesson.lessonKind !== "promo"),
          progress.completedLessons
        )
      : null;

  return (
    <section className="course-progress" aria-label="Course progress">
      <div className="course-progress-heading">
        <div>
          <p className="eyebrow">Your progress</p>
          <h3>Keep going</h3>
        </div>
        {lastViewedLesson ? (
          <Link to={lastViewedLesson.canonicalPath}>
            Resume {lastViewedLesson.title} →
          </Link>
        ) : null}
      </div>
      <div className="course-progress-bars">
        {scopeLabel && scopedStats ? (
          <ProgressBar label={scopeLabel} stats={scopedStats} />
        ) : null}
        <ProgressBar
          label="Available course catalogue"
          stats={overallStats}
          allCaughtUp
        />
      </div>
    </section>
  );
}

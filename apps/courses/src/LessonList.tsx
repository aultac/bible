import { Link } from "react-router-dom";
import {
  formatLessonSequenceBadge,
  formatLessonSequenceLabel,
  type HydratedLesson,
} from "./courseData";
import { useProgress } from "./ProgressProvider";

export function LessonListItem({ lesson }: { lesson: HydratedLesson }) {
  const sequenceLabel = formatLessonSequenceLabel(lesson);
  const { completedLessonIds, setCompleted } = useProgress();
  const completed =
    lesson.lessonKind !== "promo" && completedLessonIds.has(lesson.id);

  return (
    <li className={`lesson-row${completed ? " lesson-row-completed" : ""}`}>
      <Link className="lesson-row-main" to={lesson.canonicalPath}>
        <span className="lesson-number" aria-label={sequenceLabel}>
          {formatLessonSequenceBadge(lesson)}
        </span>
        <span className="lesson-row-copy">
          <strong>{lesson.title}</strong>
          <span>
            {lesson.youtube?.durationText
              ? `${lesson.youtube.durationText} video`
              : lesson.youtube
                ? "Video lesson"
                : "Reading and notes"}
            {lesson.resolvedMap ? " · Map" : ""}
            {lesson.resolvedResources.length > 0
              ? ` · ${lesson.resolvedResources.length} ${
                  lesson.resolvedResources.length === 1 ? "resource" : "resources"
                }`
              : ""}
          </span>
        </span>
        <span className="lesson-row-action">
          {completed ? "✓ Done" : "View lesson"}
        </span>
      </Link>
      {lesson.lessonKind !== "promo" ? (
        <button
          className="lesson-row-completion"
          type="button"
          aria-pressed={completed}
          aria-label={
            completed
              ? `Mark ${lesson.title} not done`
              : `Mark ${lesson.title} done`
          }
          onClick={() => setCompleted(lesson.id, !completed)}
        >
          {completed ? "✓ Done" : "Mark done"}
        </button>
      ) : null}
      {lesson.passage?.esvUrl ? (
        <a
          className="lesson-esv-link"
          href={lesson.passage.esvUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Read ${lesson.passage.display} on ESV.org`}
        >
          ESV
        </a>
      ) : null}
    </li>
  );
}

export function LessonList({
  lessons,
  label,
}: {
  lessons: HydratedLesson[];
  label: string;
}) {
  return (
    <ol className="lesson-list" aria-label={label}>
      {lessons.map((lesson) => (
        <LessonListItem key={lesson.id} lesson={lesson} />
      ))}
    </ol>
  );
}

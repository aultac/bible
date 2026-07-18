import { Link } from "react-router-dom";
import type { HydratedLesson } from "./courseData";

export function LessonListItem({ lesson }: { lesson: HydratedLesson }) {
  const weekNumber =
    lesson.youtube?.weekNumber ??
    lesson.youtube?.position ??
    lesson.sequenceNumber;

  return (
    <li className="lesson-row">
      <Link className="lesson-row-main" to={lesson.canonicalPath}>
        <span className="lesson-number">{String(weekNumber).padStart(2, "0")}</span>
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
        <span className="lesson-row-action">View lesson</span>
      </Link>
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

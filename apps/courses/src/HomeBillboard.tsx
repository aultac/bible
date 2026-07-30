import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  formatLessonSequenceLabel,
  type HydratedLesson,
} from "./courseData";
import {
  createBillboardRotationController,
  type BillboardRotationController,
} from "./billboardRotation";
import { VideoPlayer } from "./VideoPlayer";

export function HomeBillboard({
  lessons,
}: {
  lessons: HydratedLesson[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const controllerRef = useRef<BillboardRotationController | null>(null);
  const lessonKey = lessons.map((lesson) => lesson.id).join("|");

  useEffect(() => {
    setActiveIndex(0);
    setUserPaused(false);
  }, [lessonKey]);

  useEffect(() => {
    const controller = createBillboardRotationController({
      slideCount: lessons.length,
      onAdvance: () => {
        setActiveIndex((current) => (current + 1) % lessons.length);
      },
    });
    controllerRef.current = controller;
    controller.start();

    return () => {
      controller.stop();
      controllerRef.current = null;
    };
  }, [lessons.length]);

  useEffect(() => {
    controllerRef.current?.setPaused("user", userPaused);
  }, [userPaused]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setReducedMotion(mediaQuery.matches);
      controllerRef.current?.setPaused(
        "reduced-motion",
        mediaQuery.matches
      );
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  useEffect(() => {
    const updateVisibility = () => {
      controllerRef.current?.setPaused("hidden", document.hidden);
    };

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  if (lessons.length === 0) {
    return (
      <section className="billboard billboard-empty">
        <div>
          <p className="eyebrow">Know Your Bible</p>
          <h1>Start at the beginning.</h1>
          <p className="billboard-description">
            Course videos will appear here as they are published.
          </p>
        </div>
      </section>
    );
  }

  const safeIndex = Math.min(activeIndex, lessons.length - 1);
  const activeLesson = lessons[safeIndex];
  const hasMultipleSlides = lessons.length > 1;
  const goToSlide = (nextIndex: number) => {
    setActiveIndex(
      ((nextIndex % lessons.length) + lessons.length) % lessons.length
    );
    controllerRef.current?.reset();
  };

  return (
    <section
      className="billboard-carousel"
      aria-label="Featured course lessons"
      aria-roledescription="carousel"
      onMouseEnter={() =>
        controllerRef.current?.setPaused("hover", true)
      }
      onMouseLeave={() =>
        controllerRef.current?.setPaused("hover", false)
      }
      onFocusCapture={() =>
        controllerRef.current?.setPaused("focus", true)
      }
      onBlurCapture={(event) => {
        if (
          !event.relatedTarget ||
          !event.currentTarget.contains(event.relatedTarget as Node)
        ) {
          controllerRef.current?.setPaused("focus", false);
        }
      }}
    >
      <div
        key={activeLesson.id}
        className="billboard billboard-slide"
        role="group"
        aria-label={`${safeIndex + 1} of ${lessons.length}`}
        aria-roledescription="slide"
        aria-live={userPaused || reducedMotion ? "polite" : "off"}
      >
        <div className="billboard-media">
          <VideoPlayer lesson={activeLesson} eager />
        </div>
        <div className="billboard-copy">
          <p className="eyebrow">
            {activeLesson.lessonKind === "promo"
              ? "Course preview"
              : "Latest course"}
          </p>
          <h1>{activeLesson.title}</h1>
          <p className="billboard-description">
            {activeLesson.videoSummary ||
              "Follow the Bible’s storyline in order, with the historical and literary context that makes each passage easier to understand."}
          </p>
          <div className="billboard-meta">
            <span>{formatLessonSequenceLabel(activeLesson)}</span>
            {activeLesson.youtube?.durationText ? (
              <span>{activeLesson.youtube.durationText}</span>
            ) : null}
          </div>
          <div className="button-row">
            <Link
              className="button button-primary"
              to={activeLesson.canonicalPath}
            >
              Explore this lesson
            </Link>
            {activeLesson.passage?.esvUrl ? (
              <a
                className="button button-quiet"
                href={activeLesson.passage.esvUrl}
                target="_blank"
                rel="noreferrer"
              >
                Read in ESV
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {hasMultipleSlides ? (
        <div
          className="billboard-controls"
          role="group"
          aria-label="Billboard controls"
        >
          <button
            className="billboard-control billboard-rotation-control"
            type="button"
            disabled={reducedMotion}
            aria-label={
              reducedMotion
                ? "Automatic rotation disabled by reduced motion preference"
                : userPaused
                  ? "Resume automatic rotation"
                  : "Pause automatic rotation"
            }
            onClick={() => setUserPaused((paused) => !paused)}
          >
            {reducedMotion
              ? "Manual"
              : userPaused
                ? "Resume"
                : "Pause"}
          </button>
          <button
            className="billboard-control billboard-arrow"
            type="button"
            aria-label="Show previous billboard item"
            onClick={() => goToSlide(safeIndex - 1)}
          >
            ←
          </button>
          <div
            className="billboard-dots"
            role="group"
            aria-label="Choose billboard item"
          >
            {lessons.map((lesson, index) => (
              <button
                key={lesson.id}
                type="button"
                className={
                  index === safeIndex ? "billboard-dot-active" : undefined
                }
                aria-label={`Show ${lesson.title}`}
                aria-current={index === safeIndex ? "true" : undefined}
                onClick={() => goToSlide(index)}
              />
            ))}
          </div>
          <span className="billboard-position" aria-hidden="true">
            {safeIndex + 1} / {lessons.length}
          </span>
          <button
            className="billboard-control billboard-arrow"
            type="button"
            aria-label="Show next billboard item"
            onClick={() => goToSlide(safeIndex + 1)}
          >
            →
          </button>
        </div>
      ) : null}
    </section>
  );
}

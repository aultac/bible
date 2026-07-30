import type { HydratedLesson } from "./courseData";

function getYoutubeEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    videoId
  )}?rel=0`;
}

export function VideoPlayer({
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

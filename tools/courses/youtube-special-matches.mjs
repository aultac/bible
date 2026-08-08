import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./config.mjs";
import { writeJsonAtomic } from "./weekly-cache.mjs";
import {
  classifyVideoLesson,
  normalizeYoutubeLessonTitle,
} from "./youtube-playlist.mjs";

export const YOUTUBE_SPECIAL_MATCHES_PATH = path.join(
  REPO_ROOT,
  "apps",
  "courses",
  "content",
  "youtube-special-matches.json"
);

export const EMPTY_YOUTUBE_SPECIAL_MATCHES = Object.freeze({
  schemaVersion: 1,
  matches: [],
});

function compareMatches(left, right) {
  return (
    left.lessonSequenceNumber - right.lessonSequenceNumber ||
    left.videoId.localeCompare(right.videoId)
  );
}

export function validateYoutubeSpecialMatches(manifest) {
  const findings = [];

  if (!manifest || typeof manifest !== "object") {
    return [
      {
        severity: "error",
        code: "special-manifest-invalid",
        message: "YouTube special matches must be a JSON object.",
      },
    ];
  }
  if (manifest.schemaVersion !== 1) {
    findings.push({
      severity: "error",
      code: "special-manifest-schema",
      message: "YouTube special matches must use schema version 1.",
    });
  }
  if (!Array.isArray(manifest.matches)) {
    findings.push({
      severity: "error",
      code: "special-manifest-matches-invalid",
      message: "YouTube special matches must contain a matches array.",
    });
    return findings;
  }

  const videoOwners = new Map();
  const lessonOwners = new Map();
  for (const [index, match] of manifest.matches.entries()) {
    if (!match || typeof match !== "object") {
      findings.push({
        severity: "error",
        code: "special-match-invalid",
        message: `Special match ${index + 1} must be an object.`,
      });
      continue;
    }

    const videoId =
      typeof match.videoId === "string" ? match.videoId.trim() : "";
    const lessonSequenceNumber = match.lessonSequenceNumber;
    if (!videoId) {
      findings.push({
        severity: "error",
        code: "special-match-video-missing",
        message: `Special match ${index + 1} has no video ID.`,
      });
    } else if (videoOwners.has(videoId)) {
      findings.push({
        severity: "error",
        code: "special-match-video-duplicate",
        message: `Video ${videoId} appears more than once in special matches.`,
        videoId,
      });
    } else {
      videoOwners.set(videoId, index);
    }

    if (
      !Number.isInteger(lessonSequenceNumber) ||
      lessonSequenceNumber < 0
    ) {
      findings.push({
        severity: "error",
        code: "special-match-lesson-invalid",
        message: `Special match ${index + 1} has an invalid lesson sequence.`,
        videoId: videoId || null,
      });
    } else if (lessonOwners.has(lessonSequenceNumber)) {
      findings.push({
        severity: "error",
        code: "special-match-lesson-duplicate",
        message: `Lesson sequence ${lessonSequenceNumber} appears more than once in special matches.`,
        videoId: videoId || null,
        lessonSequenceNumber,
      });
    } else {
      lessonOwners.set(lessonSequenceNumber, videoId);
    }

    for (const field of ["videoTitle", "lessonTitle"]) {
      if (
        match[field] !== undefined &&
        match[field] !== null &&
        typeof match[field] !== "string"
      ) {
        findings.push({
          severity: "error",
          code: "special-match-title-invalid",
          message: `${field} for video ${videoId || index + 1} must be a string.`,
          videoId: videoId || null,
        });
      }
    }
  }

  return findings;
}

export function normalizeYoutubeSpecialMatches(manifest) {
  const findings = validateYoutubeSpecialMatches(manifest);
  if (findings.some((finding) => finding.severity === "error")) {
    throw new Error(findings.map((finding) => finding.message).join("\n"));
  }
  return {
    schemaVersion: 1,
    matches: manifest.matches
      .map((match) => ({
        videoId: match.videoId.trim(),
        lessonSequenceNumber: match.lessonSequenceNumber,
        videoTitle: String(match.videoTitle || "").trim(),
        lessonTitle: String(match.lessonTitle || "").trim(),
      }))
      .sort(compareMatches),
  };
}

export function fingerprintYoutubeSpecialMatches(manifest) {
  return createHash("sha256")
    .update(JSON.stringify(normalizeYoutubeSpecialMatches(manifest)))
    .digest("hex");
}

export async function loadYoutubeSpecialMatches(
  manifestPath = YOUTUBE_SPECIAL_MATCHES_PATH
) {
  try {
    return normalizeYoutubeSpecialMatches(
      JSON.parse(await readFile(manifestPath, "utf8"))
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { schemaVersion: 1, matches: [] };
    }
    throw error;
  }
}

export async function saveYoutubeSpecialMatches(
  manifest,
  manifestPath = YOUTUBE_SPECIAL_MATCHES_PATH
) {
  const normalized = normalizeYoutubeSpecialMatches(manifest);
  await writeJsonAtomic(manifestPath, normalized);
  return normalized;
}

export function addYoutubeSpecialMatch(manifest, video, lesson) {
  return normalizeYoutubeSpecialMatches({
    schemaVersion: 1,
    matches: [
      ...(manifest?.matches || []),
      {
        videoId: video.videoId,
        lessonSequenceNumber: lesson.sequenceNumber,
        videoTitle: video.title,
        lessonTitle:
          lesson.displayTitle || lesson.title || lesson.passage?.display || "",
      },
    ],
  });
}

export function removeYoutubeSpecialMatch(manifest, videoId) {
  return normalizeYoutubeSpecialMatches({
    schemaVersion: 1,
    matches: (manifest?.matches || []).filter(
      (match) => match.videoId !== videoId
    ),
  });
}

function lessonTitles(lesson) {
  return [
    lesson.title,
    lesson.displayTitle,
    lesson.passage?.display,
    lesson.passageDisplay,
  ].filter((title) => typeof title === "string" && title.trim());
}

function makeDiagnostic(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

function buildLessonLookups(lessons) {
  const bySequence = new Map();
  const byTitle = new Map();

  for (const lesson of lessons || []) {
    if (
      !Number.isInteger(lesson.sequenceNumber) ||
      lesson.sequenceNumber < 0
    ) {
      continue;
    }
    bySequence.set(lesson.sequenceNumber, lesson);
    for (const title of new Set(lessonTitles(lesson))) {
      const key = normalizeYoutubeLessonTitle(title);
      const existing = byTitle.get(key) || [];
      existing.push(lesson);
      byTitle.set(key, existing);
    }
  }
  return { bySequence, byTitle };
}

export function resolvePlaylistVideoMatches(
  playlistSnapshot,
  { lessons = [], specialMatches = EMPTY_YOUTUBE_SPECIAL_MATCHES } = {}
) {
  const manifest = normalizeYoutubeSpecialMatches(specialMatches);
  const manifestFingerprint = fingerprintYoutubeSpecialMatches(manifest);
  const diagnostics = [];
  const { bySequence, byTitle } = buildLessonLookups(lessons);
  const lessonOwners = new Map();
  const videos = (playlistSnapshot?.videos || []).map((video) => {
    const classification = classifyVideoLesson(video.title);
    const resolved = {
      ...video,
      ...classification,
    };

    if (
      classification.titleFormat === "passage" &&
      classification.passageTitle
    ) {
      const candidates =
        byTitle.get(
          normalizeYoutubeLessonTitle(classification.passageTitle)
        ) || [];
      if (candidates.length === 1) {
        resolved.lessonSequenceNumber = candidates[0].sequenceNumber;
        resolved.matchMethod = "passage-title";
      } else if (candidates.length > 1) {
        diagnostics.push(
          makeDiagnostic(
            "error",
            "passage-title-ambiguous",
            `${video.title} matches multiple local lessons.`,
            { videoId: video.videoId, title: video.title }
          )
        );
      }
    }

    if (Number.isInteger(resolved.lessonSequenceNumber)) {
      if (!bySequence.has(resolved.lessonSequenceNumber)) {
        diagnostics.push(
          makeDiagnostic(
            "error",
            "automatic-lesson-missing",
            `${video.title} maps to missing or unpublished lesson sequence ${resolved.lessonSequenceNumber}.`,
            {
              videoId: video.videoId,
              lessonSequenceNumber: resolved.lessonSequenceNumber,
            }
          )
        );
      }
      const existingOwner = lessonOwners.get(
        resolved.lessonSequenceNumber
      );
      if (existingOwner) {
        diagnostics.push(
          makeDiagnostic(
            "error",
            "lesson-sequence-duplicate",
            `Videos ${existingOwner} and ${video.videoId} both map to lesson sequence ${resolved.lessonSequenceNumber}.`,
            {
              videoId: video.videoId,
              lessonSequenceNumber: resolved.lessonSequenceNumber,
            }
          )
        );
      } else {
        lessonOwners.set(resolved.lessonSequenceNumber, video.videoId);
      }
    }
    return resolved;
  });

  const videosById = new Map(videos.map((video) => [video.videoId, video]));
  const specialMatchStatuses = [];
  for (const specialMatch of manifest.matches) {
    const video = videosById.get(specialMatch.videoId);
    const lesson = bySequence.get(specialMatch.lessonSequenceNumber);
    let status = "active";

    if (!video) {
      status = "stale";
      diagnostics.push(
        makeDiagnostic(
          "warning",
          "special-match-video-stale",
          `Special match video ${specialMatch.videoId} is not in the current playlist.`,
          {
            videoId: specialMatch.videoId,
            lessonSequenceNumber: specialMatch.lessonSequenceNumber,
          }
        )
      );
    } else if (!lesson) {
      status = "invalid";
      diagnostics.push(
        makeDiagnostic(
          "error",
          "special-match-lesson-missing",
          `Special match for ${video.title} references missing or unpublished lesson sequence ${specialMatch.lessonSequenceNumber}.`,
          {
            videoId: specialMatch.videoId,
            lessonSequenceNumber: specialMatch.lessonSequenceNumber,
          }
        )
      );
    } else if (Number.isInteger(video.lessonSequenceNumber)) {
      if (
        video.lessonSequenceNumber === specialMatch.lessonSequenceNumber
      ) {
        status = "redundant";
        diagnostics.push(
          makeDiagnostic(
            "warning",
            "special-match-redundant",
            `${video.title} now automatically matches lesson sequence ${specialMatch.lessonSequenceNumber}; remove its special match.`,
            {
              videoId: specialMatch.videoId,
              lessonSequenceNumber: specialMatch.lessonSequenceNumber,
            }
          )
        );
      } else {
        status = "conflict";
        diagnostics.push(
          makeDiagnostic(
            "error",
            "special-match-conflict",
            `${video.title} automatically maps to lesson ${video.lessonSequenceNumber}, but its special match points to ${specialMatch.lessonSequenceNumber}.`,
            {
              videoId: specialMatch.videoId,
              automaticLessonSequenceNumber: video.lessonSequenceNumber,
              lessonSequenceNumber: specialMatch.lessonSequenceNumber,
            }
          )
        );
      }
    } else {
      const existingOwner = lessonOwners.get(
        specialMatch.lessonSequenceNumber
      );
      if (existingOwner) {
        status = "conflict";
        diagnostics.push(
          makeDiagnostic(
            "error",
            "special-match-lesson-owned",
            `Lesson sequence ${specialMatch.lessonSequenceNumber} is already matched by video ${existingOwner}.`,
            {
              videoId: specialMatch.videoId,
              lessonSequenceNumber: specialMatch.lessonSequenceNumber,
              existingVideoId: existingOwner,
            }
          )
        );
      } else {
        video.videoKind =
          specialMatch.lessonSequenceNumber === 0 ? "promo" : "lesson";
        video.lessonSequenceNumber = specialMatch.lessonSequenceNumber;
        video.matchMethod = "special";
        lessonOwners.set(specialMatch.lessonSequenceNumber, video.videoId);
      }
    }

    specialMatchStatuses.push({
      ...specialMatch,
      status,
      currentVideoTitle: video?.title || null,
      currentLessonTitle:
        lesson?.displayTitle || lesson?.title || lesson?.passage?.display || null,
    });
  }

  const automaticMatchCount = videos.filter(
    (video) =>
      Number.isInteger(video.lessonSequenceNumber) &&
      video.matchMethod !== "special"
  ).length;
  const specialMatchCount = videos.filter(
    (video) => video.matchMethod === "special"
  ).length;
  const unmatchedCount = videos.filter(
    (video) => !Number.isInteger(video.lessonSequenceNumber)
  ).length;

  return {
    ...playlistSnapshot,
    schemaVersion: 3,
    videos,
    matching: {
      specialMatchesFingerprint: manifestFingerprint,
      specialMatches: specialMatchStatuses,
      diagnostics,
      automaticMatchCount,
      specialMatchCount,
      unmatchedCount,
    },
  };
}

export function formatYoutubeMatchReview(playlistSnapshot) {
  const matching = playlistSnapshot?.matching || {};
  const lines = [
    `YouTube matches: ${matching.automaticMatchCount || 0} automatic, ${
      matching.specialMatchCount || 0
    } special, ${matching.unmatchedCount || 0} unmatched`,
  ];

  for (const specialMatch of matching.specialMatches || []) {
    lines.push(
      `- ${specialMatch.status}: ${
        specialMatch.currentVideoTitle || specialMatch.videoTitle || specialMatch.videoId
      } → ${specialMatch.lessonSequenceNumber} ${
        specialMatch.currentLessonTitle || specialMatch.lessonTitle
      }`
    );
  }
  for (const video of playlistSnapshot?.videos || []) {
    if (!Number.isInteger(video.lessonSequenceNumber)) {
      lines.push(`- unmatched: ${video.title} (${video.videoId})`);
    }
  }
  return lines.join("\n");
}

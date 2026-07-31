const PLAYLIST_JSON_MARKERS = [
  "var ytInitialData = ",
  "window['ytInitialData'] = ",
  "window[\"ytInitialData\"] = ",
];
const PLAYER_JSON_MARKERS = [
  "var ytInitialPlayerResponse = ",
  "ytInitialPlayerResponse = ",
];
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const WEEK_NUMBER_PATTERN = /\bweek\s+(\d+)\b/iu;
const PROMO_PATTERN = /\bpromo\b/iu;
const DEFAULT_RETRY_DELAYS_MS = [250, 1000];
const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function describeTransportError(error) {
  const queue = [error];
  const visited = new Set();
  const details = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    if (current.code) {
      details.push(
        current.message
          ? `${current.code}: ${current.message}`
          : String(current.code)
      );
    } else if (
      current.message &&
      current.message !== "fetch failed"
    ) {
      details.push(current.message);
    }
    if (current.cause) {
      queue.push(current.cause);
    }
    if (Array.isArray(current.errors)) {
      queue.push(...current.errors);
    }
  }

  return [...new Set(details)].join("; ") || error?.message || String(error);
}

function formatAttemptCount(attemptCount) {
  return `${attemptCount} attempt${attemptCount === 1 ? "" : "s"}`;
}

function extractPlaylistId(value) {
  if (!value) {
    return null;
  }

  try {
    const parsedUrl = new URL(value);
    const playlistId = parsedUrl.searchParams.get("list");
    return playlistId || null;
  } catch {
    return value.trim() || null;
  }
}

function parsePositiveInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number.parseInt(String(value), 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function classifyVideoLesson(title) {
  if (PROMO_PATTERN.test(title)) {
    return {
      videoKind: "promo",
      weekNumber: null,
      lessonSequenceNumber: 0,
    };
  }

  const weekNumberMatch = title.match(WEEK_NUMBER_PATTERN);
  const weekNumber = parsePositiveInteger(
    weekNumberMatch ? weekNumberMatch[1] : null
  );
  return {
    videoKind: weekNumber ? "lesson" : "unmatched",
    weekNumber,
    lessonSequenceNumber: weekNumber,
  };
}

function readText(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value.text === "string") {
    return value.text;
  }

  if (typeof value.simpleText === "string") {
    return value.simpleText;
  }
  if (typeof value.content === "string") {
    return value.content;
  }

  if (Array.isArray(value.runs)) {
    return value.runs.map((run) => readText(run)).join("");
  }

  return "";
}

function extractJsonObjectAfterMarker(content, marker) {
  const markerIndex = content.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const jsonStartIndex = content.indexOf("{", markerIndex + marker.length);
  if (jsonStartIndex === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let stringDelimiter = null;
  let isEscaped = false;

  for (let index = jsonStartIndex; index < content.length; index += 1) {
    const character = content[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === stringDelimiter) {
        inString = false;
        stringDelimiter = null;
      }

      continue;
    }

    if (character === "\"" || character === "'") {
      inString = true;
      stringDelimiter = character;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return content.slice(jsonStartIndex, index + 1);
      }
    }
  }

  return null;
}

function extractInitialPlaylistData(html) {
  for (const marker of PLAYLIST_JSON_MARKERS) {
    const jsonText = extractJsonObjectAfterMarker(html, marker);
    if (jsonText) {
      return JSON.parse(jsonText);
    }
  }

  throw new Error("Could not locate ytInitialData in the playlist page response.");
}

function collectPlaylistVideoEntries(value, entries = []) {
  if (!value || typeof value !== "object") {
    return entries;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPlaylistVideoEntries(entry, entries);
    }
    return entries;
  }

  if (value.playlistVideoRenderer && typeof value.playlistVideoRenderer === "object") {
    entries.push({
      type: "playlistVideoRenderer",
      value: value.playlistVideoRenderer,
    });
    return entries;
  }

  if (
    value.lockupViewModel &&
    typeof value.lockupViewModel === "object" &&
    value.lockupViewModel.contentType === "LOCKUP_CONTENT_TYPE_VIDEO"
  ) {
    entries.push({
      type: "lockupViewModel",
      value: value.lockupViewModel,
    });
    return entries;
  }

  for (const nestedValue of Object.values(value)) {
    collectPlaylistVideoEntries(nestedValue, entries);
  }
  return entries;
}

function buildCanonicalPlaylistUrl(playlistId) {
  return `https://www.youtube.com/playlist?list=${playlistId}`;
}

function normalizePlaylistVideo(renderer, playlistId) {
  const videoId = renderer.videoId;
  if (!videoId) {
    return null;
  }

  const title = readText(renderer.title).trim();
  const position = parsePositiveInteger(readText(renderer.index));
  const lessonMatch = classifyVideoLesson(title);
  const thumbnails = renderer.thumbnail?.thumbnails || [];
  const lastThumbnail = thumbnails[thumbnails.length - 1] || null;

  return {
    videoId,
    title,
    url: `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`,
    playlistId,
    position,
    ...lessonMatch,
    durationText: readText(renderer.lengthText).trim() || null,
    thumbnailUrl:
      typeof lastThumbnail?.url === "string" ? lastThumbnail.url : null,
  };
}

function normalizePlaylistLockup(lockup, playlistId) {
  const watchCommand =
    lockup.rendererContext?.commandContext?.onTap?.innertubeCommand;
  const watchEndpoint = watchCommand?.watchEndpoint || {};
  const videoId = watchEndpoint.videoId || lockup.contentId;

  if (!videoId) {
    return null;
  }

  const title = readText(
    lockup.metadata?.lockupMetadataViewModel?.title
  ).trim();
  const rawIndex = Number.parseInt(String(watchEndpoint.index), 10);
  let position =
    Number.isFinite(rawIndex) && rawIndex >= 0 ? rawIndex + 1 : null;

  if (!position) {
    try {
      const relativeUrl =
        watchCommand?.commandMetadata?.webCommandMetadata?.url || "";
      position = parsePositiveInteger(
        new URL(relativeUrl, "https://www.youtube.com").searchParams.get(
          "index"
        )
      );
    } catch {
      position = null;
    }
  }

  const lessonMatch = classifyVideoLesson(title);
  const thumbnailSources =
    lockup.contentImage?.thumbnailViewModel?.image?.sources || [];
  const lastThumbnail =
    thumbnailSources[thumbnailSources.length - 1] || null;
  const overlays = lockup.contentImage?.thumbnailViewModel?.overlays || [];
  let durationText = null;

  for (const overlay of overlays) {
    const badges =
      overlay.thumbnailBottomOverlayViewModel?.badges || [];
    const durationBadge = badges.find(
      (badge) => badge.thumbnailBadgeViewModel?.text
    );

    if (durationBadge) {
      durationText = durationBadge.thumbnailBadgeViewModel.text;
      break;
    }
  }

  return {
    videoId,
    title,
    url: `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`,
    playlistId,
    position,
    ...lessonMatch,
    durationText,
    thumbnailUrl:
      typeof lastThumbnail?.url === "string" ? lastThumbnail.url : null,
  };
}

function extractVideoId(value) {
  if (!value) {
    return null;
  }

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.hostname === "youtu.be") {
      return parsedUrl.pathname.split("/").filter(Boolean)[0] || null;
    }
    return parsedUrl.searchParams.get("v") || null;
  } catch {
    return value.trim() || null;
  }
}

export function parsePlaylistSnapshotHtml(
  html,
  playlistUrlOrId,
  { fetchedAt = new Date().toISOString() } = {}
) {
  const playlistId = extractPlaylistId(playlistUrlOrId);

  if (!playlistId) {
    throw new Error("A valid YouTube playlist URL or playlist ID is required.");
  }
  const initialData = extractInitialPlaylistData(html);
  const entries = collectPlaylistVideoEntries(initialData);
  const videos = [];
  const seenVideoIds = new Set();

  for (const entry of entries) {
    const normalizedVideo =
      entry.type === "lockupViewModel"
        ? normalizePlaylistLockup(entry.value, playlistId)
        : normalizePlaylistVideo(entry.value, playlistId);

    if (!normalizedVideo || seenVideoIds.has(normalizedVideo.videoId)) {
      continue;
    }

    seenVideoIds.add(normalizedVideo.videoId);
    videos.push(normalizedVideo);
  }

  videos.sort((left, right) => {
    const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition;
  });
  if (videos.length === 0) {
    throw new Error(
      "YouTube playlist response contained no recognizable videos; keeping the previous cached playlist."
    );
  }

  return {
    schemaVersion: 2,
    fetchedAt,
    source: "youtube-playlist-page",
    playlistId,
    playlistUrl: buildCanonicalPlaylistUrl(playlistId),
    title:
      readText(initialData?.metadata?.playlistMetadataRenderer?.title).trim() ||
      "YouTube Playlist",
    channelName:
      readText(initialData?.header?.playlistHeaderRenderer?.ownerText).trim() || null,
    videoCount: videos.length,
    videos,
  };
}

export function parseYoutubeVideoMetadataHtml(html) {
  let playerResponse = null;

  for (const marker of PLAYER_JSON_MARKERS) {
    const jsonText = extractJsonObjectAfterMarker(html, marker);
    if (jsonText) {
      playerResponse = JSON.parse(jsonText);
      break;
    }
  }

  const videoDetails = playerResponse?.videoDetails;
  if (
    !videoDetails?.videoId ||
    typeof videoDetails.title !== "string" ||
    typeof videoDetails.shortDescription !== "string"
  ) {
    throw new Error(
      "Could not locate complete YouTube video metadata in the watch page response."
    );
  }

  return {
    videoId: videoDetails.videoId,
    title: videoDetails.title,
    description: videoDetails.shortDescription,
  };
}

export async function fetchYoutubeVideoMetadata(
  videoUrlOrId,
  { fetchImpl = fetch } = {}
) {
  const videoId = extractVideoId(videoUrlOrId);
  if (!videoId) {
    throw new Error("A valid YouTube video URL or video ID is required.");
  }

  const response = await fetchImpl(
    `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
    {
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    }
  );
  if (!response.ok) {
    throw new Error(
      `YouTube video request failed with status ${response.status}.`
    );
  }

  return parseYoutubeVideoMetadataHtml(await response.text());
}

export async function fetchPlaylistSnapshot(
  playlistUrlOrId,
  {
    fetchImpl = fetch,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    sleepFn = sleep,
    onRetry = () => {},
  } = {}
) {
  const playlistId = extractPlaylistId(playlistUrlOrId);

  if (!playlistId) {
    throw new Error("A valid YouTube playlist URL or playlist ID is required.");
  }
  const requestUrl = `${buildCanonicalPlaylistUrl(playlistId)}&hl=en`;
  let response;
  let requestAttempts = 0;
  for (
    let attemptIndex = 0;
    attemptIndex <= retryDelaysMs.length;
    attemptIndex += 1
  ) {
    const attemptCount = attemptIndex + 1;
    requestAttempts = attemptCount;
    try {
      response = await fetchImpl(requestUrl, {
        headers: {
          "user-agent": USER_AGENT,
          "accept-language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });
    } catch (error) {
      if (attemptIndex === retryDelaysMs.length) {
        throw new Error(
          `YouTube playlist request failed after ${formatAttemptCount(
            attemptCount
          )}: ${describeTransportError(
            error
          )}. Check the network connection and retry; no playlist snapshot was written.`,
          { cause: error }
        );
      }
      const delayMs = retryDelaysMs[attemptIndex];
      onRetry(
        `YouTube request failed (${describeTransportError(
          error
        )}); retrying in ${delayMs}ms.`
      );
      await sleepFn(delayMs);
      continue;
    }

    if (
      response.ok ||
      !RETRYABLE_HTTP_STATUSES.has(response.status) ||
      attemptIndex === retryDelaysMs.length
    ) {
      break;
    }
    const delayMs = retryDelaysMs[attemptIndex];
    onRetry(
      `YouTube returned status ${response.status}; retrying in ${delayMs}ms.`
    );
    await sleepFn(delayMs);
  }

  if (!response?.ok) {
    throw new Error(
      `YouTube playlist request failed with status ${
        response?.status ?? "unknown"
      } after ${formatAttemptCount(requestAttempts)}.`
    );
  }

  return parsePlaylistSnapshotHtml(await response.text(), playlistId);
}

export function buildPlaylistVideoMatchMap(playlistSnapshot) {
  const matchedVideos = new Map();

  for (const video of playlistSnapshot?.videos || []) {
    const matchKey = video.lessonSequenceNumber;

    if (!Number.isInteger(matchKey) || matchKey < 0) {
      continue;
    }
    if (matchedVideos.has(matchKey)) {
      throw new Error(
        `Multiple YouTube videos map to lesson sequence ${matchKey}.`
      );
    }
    matchedVideos.set(matchKey, video);
  }

  return matchedVideos;
}

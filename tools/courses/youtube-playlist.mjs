const PLAYLIST_JSON_MARKERS = [
  "var ytInitialData = ",
  "window['ytInitialData'] = ",
  "window[\"ytInitialData\"] = ",
];
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const WEEK_NUMBER_PATTERN = /\bweek\s+(\d+)\b/iu;

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

function collectPlaylistVideoRenderers(value, renderers = []) {
  if (!value || typeof value !== "object") {
    return renderers;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPlaylistVideoRenderers(entry, renderers);
    }
    return renderers;
  }

  if (value.playlistVideoRenderer && typeof value.playlistVideoRenderer === "object") {
    renderers.push(value.playlistVideoRenderer);
    return renderers;
  }

  for (const nestedValue of Object.values(value)) {
    collectPlaylistVideoRenderers(nestedValue, renderers);
  }

  return renderers;
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
  const weekNumberMatch = title.match(WEEK_NUMBER_PATTERN);
  const weekNumber = parsePositiveInteger(
    weekNumberMatch ? weekNumberMatch[1] : position
  );
  const thumbnails = renderer.thumbnail?.thumbnails || [];
  const lastThumbnail = thumbnails[thumbnails.length - 1] || null;

  return {
    videoId,
    title,
    url: `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`,
    playlistId,
    position,
    weekNumber,
    durationText: readText(renderer.lengthText).trim() || null,
    thumbnailUrl:
      typeof lastThumbnail?.url === "string" ? lastThumbnail.url : null,
  };
}

export async function fetchPlaylistSnapshot(playlistUrlOrId) {
  const playlistId = extractPlaylistId(playlistUrlOrId);

  if (!playlistId) {
    throw new Error("A valid YouTube playlist URL or playlist ID is required.");
  }

  const response = await fetch(`${buildCanonicalPlaylistUrl(playlistId)}&hl=en`, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `YouTube playlist request failed with status ${response.status}.`
    );
  }

  const html = await response.text();
  const initialData = extractInitialPlaylistData(html);
  const renderers = collectPlaylistVideoRenderers(initialData);
  const videos = [];
  const seenVideoIds = new Set();

  for (const renderer of renderers) {
    const normalizedVideo = normalizePlaylistVideo(renderer, playlistId);

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

  return {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
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

export function buildPlaylistVideoMatchMap(playlistSnapshot) {
  const matchedVideos = new Map();

  for (const video of playlistSnapshot?.videos || []) {
    const matchKey = video.weekNumber ?? video.position;

    if (matchKey && !matchedVideos.has(matchKey)) {
      matchedVideos.set(matchKey, video);
    }
  }

  return matchedVideos;
}

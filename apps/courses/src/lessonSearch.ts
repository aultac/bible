import { sitePath } from "./routerBase";

export type LessonSearchDocument = [
  path: string,
  title: string,
  sectionLabel: string,
  blocks: string[],
];

export interface LessonSearchIndex {
  v: 1;
  d: LessonSearchDocument[];
  t: string[];
  p: number[][];
}

export interface LessonSearchResult {
  path: string;
  title: string;
  sectionLabel: string;
  snippet: string;
  matchedTerms: string[];
  score: number;
}

interface DocumentMatch {
  score: number;
  blockScores: Map<number, number>;
  blockTokenMatches: Map<number, Set<number>>;
}

const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "i",
  "in",
  "is",
  "it",
  "its",
  "not",
  "of",
  "on",
  "or",
  "our",
  "she",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "which",
  "who",
  "will",
  "with",
  "you",
  "your",
]);

let searchIndexPromise: Promise<LessonSearchIndex> | null = null;

export function tokenizeSearchQuery(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter(
        (token) =>
          token.length >= 2 &&
          token.length <= 40 &&
          !SEARCH_STOP_WORDS.has(token)
      ) || []
  );
}

function lowerBound(terms: string[], target: string) {
  let low = 0;
  let high = terms.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (terms[middle] < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function findMatchingTermIndexes(
  terms: string[],
  token: string,
  includePrefixes: boolean
) {
  const startIndex = lowerBound(terms, token);

  if (!includePrefixes) {
    return terms[startIndex] === token ? [startIndex] : [];
  }

  const matchingIndexes: number[] = [];

  for (
    let termIndex = startIndex;
    termIndex < terms.length && matchingIndexes.length < 80;
    termIndex += 1
  ) {
    if (!terms[termIndex].startsWith(token)) {
      break;
    }
    matchingIndexes.push(termIndex);
  }

  return matchingIndexes;
}

function buildTokenMatches(
  index: LessonSearchIndex,
  token: string,
  tokenIndex: number,
  includePrefixes: boolean
) {
  const documentMatches = new Map<number, DocumentMatch>();
  const termIndexes = findMatchingTermIndexes(
    index.t,
    token,
    includePrefixes
  );

  for (const termIndex of termIndexes) {
    const matchedTerm = index.t[termIndex];
    const termWeight =
      matchedTerm === token ? 2 : Math.max(0.55, token.length / matchedTerm.length);
    const postings = index.p[termIndex] || [];

    for (let postingIndex = 0; postingIndex < postings.length; postingIndex += 3) {
      const documentId = postings[postingIndex];
      const blockId = postings[postingIndex + 1];
      const postingScore = postings[postingIndex + 2] * termWeight;
      const match = documentMatches.get(documentId) || {
        score: 0,
        blockScores: new Map<number, number>(),
        blockTokenMatches: new Map<number, Set<number>>(),
      };

      match.score += postingScore;
      match.blockScores.set(
        blockId,
        (match.blockScores.get(blockId) || 0) + postingScore
      );
      const tokenMatches =
        match.blockTokenMatches.get(blockId) || new Set<number>();
      tokenMatches.add(tokenIndex);
      match.blockTokenMatches.set(blockId, tokenMatches);
      documentMatches.set(documentId, match);
    }
  }

  return documentMatches;
}

function mergeDocumentMatch(
  target: DocumentMatch,
  source: DocumentMatch
) {
  target.score += source.score;

  for (const [blockId, score] of source.blockScores) {
    target.blockScores.set(
      blockId,
      (target.blockScores.get(blockId) || 0) + score
    );
  }

  for (const [blockId, sourceTokenMatches] of source.blockTokenMatches) {
    const targetTokenMatches =
      target.blockTokenMatches.get(blockId) || new Set<number>();
    for (const tokenIndex of sourceTokenMatches) {
      targetTokenMatches.add(tokenIndex);
    }
    target.blockTokenMatches.set(blockId, targetTokenMatches);
  }
}

function chooseSnippetBlock(
  document: LessonSearchDocument,
  match: DocumentMatch
) {
  let bestBlockId = 0;
  let bestBlockScore = -1;

  for (const [blockId, score] of match.blockScores) {
    if (blockId < 0) {
      continue;
    }

    const matchedTokenCount =
      match.blockTokenMatches.get(blockId)?.size || 0;
    const adjustedScore = score * (1 + matchedTokenCount * 0.35);

    if (adjustedScore > bestBlockScore) {
      bestBlockId = blockId;
      bestBlockScore = adjustedScore;
    }
  }

  return document[3][bestBlockId] || document[3][0] || "";
}

export function createSearchSnippet(
  block: string,
  matchedTerms: string[],
  maximumLength = 210
) {
  if (block.length <= maximumLength) {
    return block;
  }

  const normalizedBlock = block.toLowerCase();
  const firstMatch = matchedTerms.reduce((earliest, term) => {
    const matchIndex = normalizedBlock.indexOf(term.toLowerCase());
    if (matchIndex < 0) {
      return earliest;
    }
    return earliest < 0 ? matchIndex : Math.min(earliest, matchIndex);
  }, -1);
  const desiredStart =
    firstMatch < 0 ? 0 : Math.max(0, firstMatch - Math.floor(maximumLength / 3));
  let start = desiredStart;
  let end = Math.min(block.length, start + maximumLength);

  if (start > 0) {
    const nextSpace = block.indexOf(" ", start);
    if (nextSpace >= 0 && nextSpace < start + 30) {
      start = nextSpace + 1;
    }
  }

  if (end < block.length) {
    const previousSpace = block.lastIndexOf(" ", end);
    if (previousSpace > start + maximumLength / 2) {
      end = previousSpace;
    }
  }

  return `${start > 0 ? "…" : ""}${block.slice(start, end).trim()}${
    end < block.length ? "…" : ""
  }`;
}

export function searchLessonIndex(
  index: LessonSearchIndex,
  query: string,
  resultLimit = 8
): LessonSearchResult[] {
  const tokens = [...new Set(tokenizeSearchQuery(query))];

  if (tokens.length === 0 || index.v !== 1) {
    return [];
  }

  const matchesByToken = tokens.map((token, tokenIndex) =>
    buildTokenMatches(
      index,
      token,
      tokenIndex,
      tokenIndex === tokens.length - 1
    )
  );

  if (matchesByToken.some((matches) => matches.size === 0)) {
    return [];
  }

  const mergedMatches = new Map<number, DocumentMatch>();
  const [firstMatches, ...remainingMatches] = matchesByToken;

  for (const [documentId, firstMatch] of firstMatches) {
    const mergedMatch: DocumentMatch = {
      score: firstMatch.score,
      blockScores: new Map(firstMatch.blockScores),
      blockTokenMatches: new Map(
        [...firstMatch.blockTokenMatches].map(([blockId, tokenMatches]) => [
          blockId,
          new Set(tokenMatches),
        ])
      ),
    };
    let matchesEveryToken = true;

    for (const tokenMatches of remainingMatches) {
      const nextMatch = tokenMatches.get(documentId);
      if (!nextMatch) {
        matchesEveryToken = false;
        break;
      }
      mergeDocumentMatch(mergedMatch, nextMatch);
    }

    if (matchesEveryToken) {
      mergedMatches.set(documentId, mergedMatch);
    }
  }

  return [...mergedMatches]
    .map(([documentId, match]) => {
      const document = index.d[documentId];
      const block = chooseSnippetBlock(document, match);

      return {
        path: document[0],
        title: document[1],
        sectionLabel: document[2],
        snippet: createSearchSnippet(block, tokens),
        matchedTerms: tokens,
        score: match.score,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.title.localeCompare(right.title) ||
        left.path.localeCompare(right.path)
    )
    .slice(0, resultLimit);
}

function isLessonSearchIndex(value: unknown): value is LessonSearchIndex {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LessonSearchIndex>;
  return (
    candidate.v === 1 &&
    Array.isArray(candidate.d) &&
    Array.isArray(candidate.t) &&
    Array.isArray(candidate.p) &&
    candidate.t.length === candidate.p.length
  );
}

async function decodeIndexResponse(response: Response) {
  const compressedBytes = new Uint8Array(await response.arrayBuffer());
  const isGzip =
    compressedBytes[0] === 0x1f && compressedBytes[1] === 0x8b;

  if (!isGzip) {
    return new TextDecoder().decode(compressedBytes);
  }

  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot open the compressed search index.");
  }

  const decompressedStream = new Blob([compressedBytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(decompressedStream).text();
}

export async function loadLessonSearchIndex() {
  if (!searchIndexPromise) {
    searchIndexPromise = fetch(sitePath("/search/notes-index.json.gz"), {
      headers: {
        Accept: "application/gzip, application/json",
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Search index request failed: ${response.status}`);
        }

        const parsedIndex: unknown = JSON.parse(
          await decodeIndexResponse(response)
        );

        if (!isLessonSearchIndex(parsedIndex)) {
          throw new Error("Search index has an unsupported format.");
        }

        return parsedIndex;
      })
      .catch((error) => {
        searchIndexPromise = null;
        throw error;
      });
  }

  return searchIndexPromise;
}

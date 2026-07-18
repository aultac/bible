import sectionsIndexData from "../content/sections.json";
import courseOutlineData from "../content/course-outline.json";
import {
  canonicalLessonPath,
  resolveLessonByReference,
  type BibleReference,
} from "./bibleReferences";
import { sitePath } from "./routerBase";

export interface CourseOutlineSection {
  sectionnum: number;
  title: string;
  periodLabel: string;
  rangeLabel: string;
  descriptors: string[];
}

interface CourseOutlineManifest {
  schemaVersion: number;
  sections: CourseOutlineSection[];
}

export interface PassagePoint {
  bookId: string;
  chapter: number;
  verse: number | null;
  raw: string;
  bookName: string;
}

export interface PassageRecord {
  display: string;
  start?: PassagePoint;
  end?: PassagePoint;
  startVerse: string | null;
  endVerse: string | null;
  spansMultipleBooks: boolean;
  esvUrl: string;
}

export interface SectionIndexEntry {
  id: string;
  slug: string;
  sectionnum: number;
  title: string;
  info: string;
  startYear: number | null;
  endYear: number | null;
  status: string;
  startVerse: string | null;
  endVerse: string | null;
  passage: PassageRecord | null;
  lessonCount: number;
  sectionPath: string;
  sectionSummaryPath: string | null;
}

export interface SectionsIndexManifest {
  schemaVersion: number;
  generatedAt: string;
  sectionCount: number;
  sections: SectionIndexEntry[];
}

export interface SectionLessonEntry {
  id: string;
  slug: string;
  sequenceNumber: number;
  title: string;
  lessonKind: string;
  startVerse: string | null;
  endVerse: string | null;
  passage: PassageRecord | null;
  lessonPath: string;
  notesAvailable: boolean;
  summaryAvailable: boolean;
  resourceCount: number;
}

export interface SectionManifest extends SectionIndexEntry {
  lessons: SectionLessonEntry[];
  sectionSummary: {
    path: string | null;
    sourcePath: string | null;
    sourceFormat: string | null;
    available: boolean;
    error: string | null;
  };
  source: {
    relativeSectionDirectory: string;
    folderName: string;
    sectionSummaryDocxPath: string | null;
  };
}

export interface LessonResource {
  name: string;
  sourcePath: string;
  path: string;
  publicUrl: string;
}
export interface LessonMap {
  sourcePath: string;
  sourceFormat: string;
  sourcePublicUrl: string;
  geoJsonPath: string;
  geoJsonPublicUrl: string;
  available: boolean;
  featureCount: number;
  geometryTypes: string[];
}

export interface ResolvedLessonMap extends LessonMap {
  sourceHref: string;
  geoJsonHref: string;
}

export interface LessonVideo {
  videoId: string;
  title: string;
  url: string;
  playlistId: string;
  position: number | null;
  weekNumber: number | null;
  durationText: string | null;
  thumbnailUrl: string | null;
}

export interface LessonManifest {
  schemaVersion: number;
  generatedAt: string;
  id: string;
  slug: string;
  sectionId: string;
  sectionSlug: string;
  sequenceNumber: number;
  lessonKind: string;
  title: string;
  description: string;
  status: string;
  startVerse: string | null;
  endVerse: string | null;
  passage: PassageRecord | null;
  notes: {
    path: string | null;
    sourcePath: string | null;
    available: boolean;
  };
  notesSummary?: {
    path: string | null;
    sourcePath: string | null;
    sourceFormat: string | null;
    available: boolean;
    error: string | null;
  };
  summary: {
    path: string | null;
    sourcePath: string | null;
    sourceFormat: string | null;
    available: boolean;
    error: string | null;
  };
  map: LessonMap | null;
  resources: LessonResource[];
  youtube: LessonVideo | null;
  tags: string[];
  topicTags: string[];
  peopleTags: string[];
  placeTags: string[];
  source: {
    relativeLessonDirectory: string;
    folderName: string;
    notesPath: string | null;
    summaryDocxPath: string | null;
    resourcesDirectory: string | null;
    mapPath: string | null;
  };
}

export interface HydratedLesson extends LessonManifest {
  bookName: string;
  bookSlug: string;
  canonicalPath: string;
  resolvedResources: Array<LessonResource & { href: string }>;
  resolvedMap: ResolvedLessonMap | null;
}

export interface HydratedSection extends SectionManifest {
  lessonsDetailed: HydratedLesson[];
  latestLesson: HydratedLesson | null;
}

export interface CourseSection extends CourseOutlineSection {
  slug: string;
  available: boolean;
  status: string;
  passage: PassageRecord | null;
  lessonsDetailed: HydratedLesson[];
}
export interface CourseBook {
  name: string;
  slug: string;
  lessons: HydratedLesson[];
}

function normalizeContentPath(modulePath: string) {
  return modulePath.replace(/^.*?content\//u, "content/").replace(/\\/gu, "/");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function inferBookName(
  lessonManifest: LessonManifest,
  sectionManifest: SectionManifest
) {
  const passageBookName =
    lessonManifest.passage?.start?.bookName ||
    sectionManifest.passage?.start?.bookName;

  if (passageBookName) {
    return passageBookName;
  }

  const reference =
    lessonManifest.startVerse ||
    lessonManifest.passage?.display ||
    sectionManifest.startVerse ||
    sectionManifest.passage?.display ||
    sectionManifest.title;
  const inferredName = reference.match(/^[^\d:–—-]+/u)?.[0]?.trim();

  return inferredName || "Course";
}

export function resolvePublicHref(publicUrl: string) {
  if (/^https?:\/\//u.test(publicUrl)) {
    return publicUrl;
  }

  if (publicUrl.startsWith("/courses/")) {
    return sitePath(`/${publicUrl.slice("/courses/".length)}`);
  }

  if (publicUrl.startsWith("/")) {
    return sitePath(publicUrl);
  }

  return sitePath(`/${publicUrl}`);
}

const sectionManifestModules = import.meta.glob(
  "../content/sections/*/section.json",
  {
    eager: true,
    import: "default",
  }
) as Record<string, SectionManifest>;

const lessonManifestModules = import.meta.glob(
  "../content/sections/*/lessons/*/lesson.json",
  {
    eager: true,
    import: "default",
  }
) as Record<string, LessonManifest>;

const markdownModules = import.meta.glob(
  "../content/sections/**/*.md",
  {
    import: "default",
    query: "?raw",
  }
) as Record<string, () => Promise<string>>;

const markdownLoaderByPath = new Map<string, () => Promise<string>>(
  Object.entries(markdownModules).map(([modulePath, loader]) => [
    normalizeContentPath(modulePath),
    loader,
  ])
);
const markdownLoadCache = new Map<string, Promise<string | null>>();

const sectionManifestBySlug = new Map<string, SectionManifest>(
  Object.values(sectionManifestModules).map((sectionManifest) => [
    sectionManifest.slug,
    sectionManifest,
  ])
);

const lessonManifestByKey = new Map<string, LessonManifest>(
  Object.values(lessonManifestModules).map((lessonManifest) => [
    `${lessonManifest.sectionSlug}:${lessonManifest.slug}`,
    lessonManifest,
  ])
);

function getMarkdown(contentPath: string | null | undefined) {
  if (!contentPath) {
    return null;
  }
  const normalizedContentPath = normalizeContentPath(contentPath);
  const loader = markdownLoaderByPath.get(normalizedContentPath);
  if (!loader) {
    return null;
  }

  if (!markdownLoadCache.has(normalizedContentPath)) {
    markdownLoadCache.set(
      normalizedContentPath,
      loader()
        .then((markdown) => markdown)
        .catch(() => null)
    );
  }

  return markdownLoadCache.get(normalizedContentPath) || null;
}

function hydrateLesson(
  lessonManifest: LessonManifest,
  sectionManifest: SectionManifest
): HydratedLesson {
  const bookName = inferBookName(lessonManifest, sectionManifest);
  const bookSlug = slugify(bookName);
  const canonicalPath = canonicalLessonPath({
    ...lessonManifest,
    bookSlug,
  });
  return {
    ...lessonManifest,
    bookName,
    bookSlug,
    canonicalPath,
    resolvedResources: lessonManifest.resources.map((resource) => ({
      ...resource,
      href: resolvePublicHref(resource.publicUrl),
    })),
    resolvedMap: lessonManifest.map
      ? {
          ...lessonManifest.map,
          sourceHref: resolvePublicHref(lessonManifest.map.sourcePublicUrl),
          geoJsonHref: resolvePublicHref(lessonManifest.map.geoJsonPublicUrl),
        }
      : null,
  };
}

const sectionsIndex = sectionsIndexData as SectionsIndexManifest;
const courseOutline = courseOutlineData as CourseOutlineManifest;

const sections: HydratedSection[] = sectionsIndex.sections
  .map((sectionEntry): HydratedSection | null => {
    const sectionManifest = sectionManifestBySlug.get(sectionEntry.slug);

    if (!sectionManifest) {
      return null;
    }

    const lessonsDetailed = sectionManifest.lessons
      .map((lessonEntry) =>
        lessonManifestByKey.get(`${sectionManifest.slug}:${lessonEntry.slug}`)
      )
      .filter((lessonManifest): lessonManifest is LessonManifest => Boolean(lessonManifest))
      .map((lessonManifest) => hydrateLesson(lessonManifest, sectionManifest));

    const latestLesson =
      lessonsDetailed.find((lesson) => lesson.status === "current") ||
      lessonsDetailed[lessonsDetailed.length - 1] ||
      null;

    return {
      ...sectionManifest,
      lessonsDetailed,
      latestLesson,
    };
  })
  .filter((section): section is HydratedSection => Boolean(section));

const sectionBySlug = new Map<string, HydratedSection>(
  sections.map((section) => [section.slug, section])
);

const availableSectionByNumber = new Map(
  sections.map((section) => [section.sectionnum, section])
);

const courseSections: CourseSection[] = courseOutline.sections.map(
  (outlineSection) => {
    const availableSection = availableSectionByNumber.get(
      outlineSection.sectionnum
    );

    return {
      ...outlineSection,
      slug: availableSection?.slug || `section-${outlineSection.sectionnum}`,
      available: Boolean(availableSection),
      status: availableSection?.status || "forthcoming",
      passage: availableSection?.passage || null,
      lessonsDetailed: availableSection?.lessonsDetailed || [],
    };
  }
);

const allLessons = sections.flatMap((section) => section.lessonsDetailed);

const bookMap = new Map<string, CourseBook>();

for (const lesson of allLessons) {
  const existingBook = bookMap.get(lesson.bookSlug);

  if (existingBook) {
    existingBook.lessons.push(lesson);
    continue;
  }

  bookMap.set(lesson.bookSlug, {
    name: lesson.bookName,
    slug: lesson.bookSlug,
    lessons: [lesson],
  });
}

const books = [...bookMap.values()];

const lessonByKey = new Map<string, HydratedLesson>(
  allLessons.map((lesson) => [`${lesson.sectionSlug}:${lesson.slug}`, lesson])
);
const lessonByCanonicalPath = new Map<string, HydratedLesson>();

for (const lesson of allLessons) {
  const existingLesson = lessonByCanonicalPath.get(lesson.canonicalPath);

  if (existingLesson) {
    throw new Error(
      `Duplicate canonical lesson path ${lesson.canonicalPath}: ${existingLesson.id} and ${lesson.id}`
    );
  }

  lessonByCanonicalPath.set(lesson.canonicalPath, lesson);
}

const currentSection =
  sections.find((section) => section.status === "current") ||
  sections[sections.length - 1] ||
  null;

const latestLesson =
  currentSection?.lessonsDetailed.find((lesson) => lesson.status === "current") ||
  currentSection?.lessonsDetailed[currentSection.lessonsDetailed.length - 1] ||
  allLessons[allLessons.length - 1] ||
  null;
const latestVideoLesson =
  [...allLessons].reverse().find((lesson) => Boolean(lesson.youtube)) || null;
const startHereLesson = sections[0]?.lessonsDetailed[0] || null;

export const courseLibrary = {
  generatedAt: sectionsIndex.generatedAt,
  sections,
  courseSections,
  allLessons,
  books,
  currentSection,
  latestLesson,
  latestVideoLesson,
  startHereLesson,
  getBook(bookSlug: string) {
    return bookMap.get(bookSlug) || null;
  },
  getCourseSection(sectionNumber: number) {
    return (
      courseSections.find(
        (section) => section.sectionnum === sectionNumber
      ) || null
    );
  },
  getSection(sectionSlug: string) {
    return sectionBySlug.get(sectionSlug) || null;
  },
  getLesson(sectionSlug: string, lessonSlug: string) {
    return lessonByKey.get(`${sectionSlug}:${lessonSlug}`) || null;
  },
  getLessonByCanonicalPath(pathname: string) {
    return lessonByCanonicalPath.get(pathname) || null;
  },
  resolveReference(reference: BibleReference) {
    return resolveLessonByReference(allLessons, reference);
  },
  getAdjacentLessons(sectionSlug: string, lessonSlug: string) {
    const lessonKey = `${sectionSlug}:${lessonSlug}`;
    const lessonIndex = allLessons.findIndex(
      (lesson) => `${lesson.sectionSlug}:${lesson.slug}` === lessonKey
    );

    if (lessonIndex === -1) {
      return {
        previous: null,
        next: null,
      };
    }

    return {
      previous: allLessons[lessonIndex - 1] || null,
      next: allLessons[lessonIndex + 1] || null,
    };
  },
};

export async function loadMarkdownContent(contentPath: string | null | undefined) {
  return getMarkdown(contentPath);
}

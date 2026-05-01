/**
 * Shared fast-check arbitraries for ApplyFilterOrSearch property tests.
 *
 * Covers: UnvalidatedFilterInput, Tag, NoteFileSnapshot, Frontmatter, Feed
 */

import fc from "fast-check";
import type {
  Body,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type {
  Feed,
  FilterCriteria,
  SearchQuery,
  SortOrder,
} from "promptnotes-domain-types/curate/aggregates";
import type {
  AppliedFilter,
  UnvalidatedFilterInput,
} from "promptnotes-domain-types/curate/stages";

// ── Primitives ────────────────────────────────────────────────────────────────

export const ts = (ms: number): Timestamp =>
  ({ epochMillis: ms }) as unknown as Timestamp;

export const noteId = (s: string): NoteId => s as unknown as NoteId;

export const tag = (s: string): Tag => s as unknown as Tag;

export const body = (s: string): Body => s as unknown as Body;

// ── Arbitraries ───────────────────────────────────────────────────────────────

export function arbTimestamp(): fc.Arbitrary<Timestamp> {
  return fc
    .integer({ min: 1_000_000, max: 2_000_000_000_000 })
    .map((ms) => ts(ms));
}

/**
 * A valid normalized tag string: lowercase, no leading #, no whitespace, non-empty.
 * Mirrors the Tag Smart Constructor normalization rules.
 */
export function arbValidTagString(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/);
}

/** A Tag VO (already normalized, no leading #). */
export function arbTag(): fc.Arbitrary<Tag> {
  return arbValidTagString().map((s) => tag(s));
}

/** An invalid tag string that tryNewTag must reject (empty or whitespace-only). */
export function arbInvalidTagString(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(""),
    fc.stringOf(fc.constant(" "), { minLength: 1, maxLength: 10 }),
    fc.stringOf(fc.constant("\t"), { minLength: 1, maxLength: 5 }),
  );
}

/** A raw tag string that may or may not be valid (for PROP-017 fail-fast tests). */
export function arbRawTagString(): fc.Arbitrary<string> {
  return fc.oneof(
    // Valid variants
    arbValidTagString(),
    // Leading # variants (valid after normalization)
    arbValidTagString().map((s) => `#${s}`),
    // Whitespace-padded variants (valid after trim/lower)
    arbValidTagString().map((s) => `  ${s}  `),
    // Mixed-case variants (valid after lowercase)
    arbValidTagString().map((s) => s.toUpperCase()),
  );
}

export function arbFrontmatter(
  overrides: { tags?: fc.Arbitrary<readonly Tag[]> } = {},
): fc.Arbitrary<Frontmatter> {
  return fc
    .record({
      tags: overrides.tags ?? fc.array(arbTag(), { maxLength: 5 }),
      createdAt: arbTimestamp(),
      updatedAt: arbTimestamp(),
    })
    .map((fm) => fm as unknown as Frontmatter);
}

export function arbBody(): fc.Arbitrary<Body> {
  return fc.string({ maxLength: 200 }).map((s) => body(s));
}

export function arbNoteId(): fc.Arbitrary<NoteId> {
  return fc
    .stringMatching(/^[a-z][a-z0-9-]{5,25}$/)
    .map((s) => noteId(s));
}

export function arbNoteFileSnapshot(): fc.Arbitrary<NoteFileSnapshot> {
  return fc.record({
    noteId: arbNoteId(),
    body: arbBody(),
    frontmatter: arbFrontmatter(),
    filePath: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `/vault/${s}.md`),
    fileMtime: arbTimestamp(),
  });
}

/** Array of snapshots with unique noteIds (up to maxLength). */
export function arbSnapshotArray(maxLength = 20): fc.Arbitrary<readonly NoteFileSnapshot[]> {
  return fc.uniqueArray(arbNoteFileSnapshot(), {
    maxLength,
    selector: (s) => s.noteId as string,
  });
}

export function arbSortOrder(): fc.Arbitrary<SortOrder> {
  return fc
    .record({
      field: fc.constant("timestamp" as const),
      direction: fc.oneof(fc.constant("desc" as const), fc.constant("asc" as const)),
    });
}

/**
 * Feed with arbitrary noteRefs (no invariant violations assumed in test input;
 * tests are responsible for providing consistent snapshots if needed).
 */
export function arbFeed(noteRefs?: fc.Arbitrary<readonly NoteId[]>): fc.Arbitrary<Feed> {
  const refs = noteRefs ?? fc.array(arbNoteId(), { maxLength: 20 });
  return fc.record({
    noteRefs: refs,
    filterCriteria: fc.constant({
      tags: [] as readonly Tag[],
      frontmatterFields: new Map<string, string>(),
    } as FilterCriteria),
    searchQuery: fc.constant(null),
    sortOrder: arbSortOrder(),
  });
}

/**
 * A (Feed, snapshots) pair where the Feed's noteRefs are a subset of the
 * snapshot noteIds — ensures the intersection is well-defined.
 */
export function arbFeedAndSnapshots(maxSnapshots = 20): fc.Arbitrary<{
  feed: Feed;
  snapshots: readonly NoteFileSnapshot[];
}> {
  return arbSnapshotArray(maxSnapshots).chain((snapshots) => {
    const allIds = snapshots.map((s) => s.noteId);
    // Feed may reference a subset of those IDs (plus some unresolvable extras)
    return fc
      .subarray(allIds, { minLength: 0 })
      .chain((refSubset) => {
        // Optionally add some IDs not in snapshots (unresolvable refs)
        return fc.array(arbNoteId(), { maxLength: 3 }).map((extras) => {
          const noteRefs = [...refSubset, ...extras] as readonly NoteId[];
          const feed: Feed = {
            noteRefs,
            filterCriteria: {
              tags: [],
              frontmatterFields: new Map<string, string>(),
            },
            searchQuery: null,
            sortOrder: { field: "timestamp", direction: "desc" },
          };
          return { feed, snapshots };
        });
      });
  });
}

export function arbUnvalidatedFilterInput(
  validTagsOnly = true,
): fc.Arbitrary<UnvalidatedFilterInput> {
  const tagsArb = validTagsOnly
    ? fc.array(arbRawTagString(), { maxLength: 5 })
    : fc.array(
        fc.oneof(arbRawTagString(), arbInvalidTagString()),
        { maxLength: 5 },
      );

  return fc.record({
    kind: fc.constant("UnvalidatedFilterInput" as const),
    tagsRaw: tagsArb,
    fieldsRaw: fc.constant(new Map<string, string>()),
    searchTextRaw: fc.oneof(
      fc.constant(null),
      fc.constant(""),
      fc.string({ maxLength: 30 }),
    ),
    sortOrder: arbSortOrder(),
  });
}

/** AppliedFilter with empty criteria and null query — the no-op case. */
export function arbAppliedFilterNoOp(): fc.Arbitrary<AppliedFilter> {
  return arbSortOrder().map((sortOrder) => ({
    kind: "AppliedFilter" as const,
    criteria: {
      tags: [] as readonly Tag[],
      frontmatterFields: new Map<string, string>(),
    } as FilterCriteria,
    query: null,
    sortOrder,
  }));
}

/** AppliedFilter with specified tag criteria (tags already are Tag VOs). */
export function arbAppliedFilterWithTags(
  tags: fc.Arbitrary<readonly Tag[]> = fc.array(arbTag(), { minLength: 1, maxLength: 5 }),
): fc.Arbitrary<AppliedFilter> {
  return fc.record({
    kind: fc.constant("AppliedFilter" as const),
    criteria: fc.record({
      tags,
      frontmatterFields: fc.constant(new Map<string, string>()),
    }) as fc.Arbitrary<FilterCriteria>,
    query: fc.constant(null) as fc.Arbitrary<SearchQuery | null>,
    sortOrder: arbSortOrder(),
  });
}

/** SearchQuery with arbitrary text. */
export function arbSearchQuery(): fc.Arbitrary<SearchQuery> {
  return fc.record({
    text: fc.string({ minLength: 1, maxLength: 40 }),
    scope: fc.constant("body+frontmatter" as const),
  });
}

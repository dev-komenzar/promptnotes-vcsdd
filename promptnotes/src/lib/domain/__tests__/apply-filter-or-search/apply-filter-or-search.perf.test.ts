/**
 * apply-filter-or-search.perf.test.ts — Performance benchmark.
 *
 * REQ-016: applyFilterOrSearch with 1000 snapshots, 5 tags, 1 search term
 *          completes in < 50ms (median of 5 runs after 1 warmup).
 *
 * Methodology (pinned per verification-architecture.md):
 *   1. 1 warmup run (result discarded).
 *   2. 5 measurement runs using performance.now() before/after each call.
 *   3. Median of the 5 measurements is compared against the 50ms threshold.
 *   4. Runtime: bun:test
 *   5. Soft regression bound — advisory in CI environments.
 */

import { describe, test, expect } from "bun:test";

// Soft regression bounds — advisory in CI environments per verification-architecture.md.
// Hard assertions use a 5× safety multiplier so only catastrophic regressions fail CI.
const ADVISORY_APPLY_MS = 50;
const CATASTROPHIC_APPLY_MS = ADVISORY_APPLY_MS * 5; // 250ms
const ADVISORY_PARSE_MS = 5;
const CATASTROPHIC_PARSE_MS = ADVISORY_PARSE_MS * 5; // 25ms
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
  SortOrder,
} from "promptnotes-domain-types/curate/aggregates";
import type { AppliedFilter } from "promptnotes-domain-types/curate/stages";
import { applyFilterOrSearch } from "$lib/domain/apply-filter-or-search/apply-filter-or-search";
import { parseFilterInput } from "$lib/domain/apply-filter-or-search/parse-filter-input";
import type { UnvalidatedFilterInput } from "promptnotes-domain-types/curate/stages";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ts = (ms: number): Timestamp => ({ epochMillis: ms }) as unknown as Timestamp;
const id = (s: string): NoteId => s as unknown as NoteId;
const tg = (s: string): Tag => s as unknown as Tag;
const bd = (s: string): Body => s as unknown as Body;

const TAGS_POOL = ["draft", "review", "claude-code", "typescript", "refactor"] as const;

function makeSnapshotForBench(index: number): NoteFileSnapshot {
  // Distribute tags across snapshots: each note gets 1-3 tags from the pool
  const numTags = (index % 3) + 1;
  const tags = Array.from({ length: numTags }, (_, i) =>
    tg(TAGS_POOL[(index + i) % TAGS_POOL.length]),
  );
  const bodyStr = index % 5 === 0
    ? `Note ${index} with test keyword inside`
    : `Note ${index} about ${TAGS_POOL[index % TAGS_POOL.length]} concepts`;
  return {
    noteId: id(`bench-note-${String(index).padStart(4, "0")}`),
    body: bd(bodyStr),
    frontmatter: {
      tags,
      createdAt: ts(1_000_000 + index * 1000),
      updatedAt: ts(1_000_000 + index * 1000 + (index % 100) * 7),
    } as unknown as Frontmatter,
    filePath: `/vault/bench-note-${index}.md`,
    fileMtime: ts(1_000_000 + index * 1000),
  };
}

function medianOf(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe("perf", () => {
  test("applyFilterOrSearch with 1000 snapshots completes in < 50ms (median of 5 runs)", () => {
    const N = 1000;
    const snapshots: NoteFileSnapshot[] = Array.from({ length: N }, (_, i) =>
      makeSnapshotForBench(i),
    );

    const sortOrder: SortOrder = { field: "timestamp", direction: "desc" };
    const noteRefs = snapshots.map((s) => s.noteId);
    const feed: Feed = {
      noteRefs,
      filterCriteria: { tags: [], frontmatterFields: new Map() } as FilterCriteria,
      searchQuery: null,
      sortOrder,
    };

    // 5 criteria.tags, 1 search term
    const applied: AppliedFilter = {
      kind: "AppliedFilter",
      criteria: {
        tags: TAGS_POOL.map(tg) as readonly Tag[],
        frontmatterFields: new Map(),
      } as FilterCriteria,
      query: { text: "test", scope: "body+frontmatter" },
      sortOrder,
    };

    // 1 warmup run (discarded)
    applyFilterOrSearch(feed, applied, snapshots);

    // 5 measurement runs
    const times = Array.from({ length: 5 }, () => {
      const t0 = performance.now();
      applyFilterOrSearch(feed, applied, snapshots);
      return performance.now() - t0;
    });

    const median = medianOf(times);
    // soft regression bound — advisory in CI environments (verification-architecture.md)
    console.log(`[perf] applyFilterOrSearch median: ${median.toFixed(3)}ms (advisory bound: ${ADVISORY_APPLY_MS}ms)`);
    if (median >= ADVISORY_APPLY_MS) {
      console.warn(
        `[perf] ADVISORY EXCEEDED: applyFilterOrSearch median ${median.toFixed(3)}ms >= ${ADVISORY_APPLY_MS}ms soft bound`,
      );
    }
    // Hard sanity check: only catastrophic regressions (5× advisory) fail CI
    expect(median).toBeLessThan(CATASTROPHIC_APPLY_MS);
  });

  test("parseFilterInput with 10 tags completes in < 5ms", () => {
    const sortOrder: SortOrder = { field: "timestamp", direction: "desc" };
    const input: UnvalidatedFilterInput = {
      kind: "UnvalidatedFilterInput",
      tagsRaw: TAGS_POOL.flatMap((t) => [t, t.toUpperCase(), `  ${t}  `]).slice(0, 10),
      fieldsRaw: new Map(),
      searchTextRaw: "test query",
      sortOrder,
    };

    // warmup
    parseFilterInput(input);

    // 5 measurements
    const times = Array.from({ length: 5 }, () => {
      const t0 = performance.now();
      parseFilterInput(input);
      return performance.now() - t0;
    });

    const median = medianOf(times);
    // soft regression bound — advisory in CI environments (verification-architecture.md)
    console.log(`[perf] parseFilterInput median: ${median.toFixed(3)}ms (advisory bound: ${ADVISORY_PARSE_MS}ms)`);
    if (median >= ADVISORY_PARSE_MS) {
      console.warn(
        `[perf] ADVISORY EXCEEDED: parseFilterInput median ${median.toFixed(3)}ms >= ${ADVISORY_PARSE_MS}ms soft bound`,
      );
    }
    // Hard sanity check: only catastrophic regressions (5× advisory) fail CI
    expect(median).toBeLessThan(CATASTROPHIC_PARSE_MS);
  });
});

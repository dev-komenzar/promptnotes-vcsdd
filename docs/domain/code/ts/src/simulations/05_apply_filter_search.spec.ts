// Phase 11 — シナリオ 5/6: タグフィルタと検索 (ApplyFilterOrSearch)
//
// 対応シナリオ: validation.md「シナリオ 5: タグでフィルタ」「シナリオ 6: 検索」
// 対応ワークフロー: workflows.md Workflow 7 (ApplyFilterOrSearch)
// 自動生成: 2026-04-28
//
// 検証目的:
//   1. UnvalidatedFilterInput → AppliedFilter → VisibleNoteIds の Pure pipeline が型表現可能
//   2. Feed の filterCriteria / searchQuery / sortOrder が完全構造で揃う
//   3. 0 件結果 (hasZeroResults=true) を VisibleNoteIds が表現できる

import type { Result } from "../util/result.js";
import { ok, err } from "../util/result.js";
import type { NoteFileSnapshot } from "../shared/snapshots.js";
import type {
  Feed,
  FilterCriteria,
  SearchQuery,
  SortOrder,
} from "../curate/aggregates.js";
import type {
  AppliedFilter,
  UnvalidatedFilterInput,
  VisibleNoteIds,
} from "../curate/stages.js";
import type {
  ApplyFilterOrSearch,
  ParseFilterInput,
} from "../curate/workflows.js";
import { assertType } from "./_assert.js";
import {
  mockFrontmatter,
  mockNoteId,
  mockTag,
  mockTimestamp,
} from "./_mock.js";

// ──────────────────────────────────────────────────────────────────────
// Given: Feed に 47 件、TagInventory に "claude-code"(12), "review"(3) が存在
// ──────────────────────────────────────────────────────────────────────

const t0 = mockTimestamp(1_700_000_000_000);

const draftTag = mockTag("draft");
const reviewTag = mockTag("review");
const claudeTag = mockTag("claude-code");

const sortOrder: SortOrder = { field: "timestamp", direction: "desc" };

const noteIds = Array.from({ length: 47 }).map((_, i) =>
  mockNoteId(`2026-04-${String((i % 28) + 1).padStart(2, "0")}-100000-${String(i).padStart(3, "0")}`),
);

const fm = (tags: ReadonlyArray<typeof draftTag>) =>
  mockFrontmatter(tags, t0, t0);

const snapshots: readonly NoteFileSnapshot[] = noteIds.map((id, i) => ({
  noteId: id,
  body: `body-${i}` as never,
  frontmatter:
    i % 4 === 0
      ? fm([claudeTag, reviewTag])
      : i % 3 === 0
        ? fm([reviewTag])
        : fm([draftTag]),
  filePath: `/home/user/vault/${id}.md`,
  fileMtime: t0,
}));

const initialFilter: FilterCriteria = {
  tags: [],
  frontmatterFields: new Map<string, string>(),
};

const initialFeed: Feed = {
  noteRefs: noteIds,
  filterCriteria: initialFilter,
  searchQuery: null,
  sortOrder,
};

// ──────────────────────────────────────────────────────────────────────
// シナリオ 5: タグ "claude-code" でフィルタ → AppliedFilter
// ──────────────────────────────────────────────────────────────────────

const filterInput: UnvalidatedFilterInput = {
  kind: "UnvalidatedFilterInput",
  tagsRaw: ["claude-code"],
  fieldsRaw: new Map<string, string>(),
  searchTextRaw: null,
  sortOrder,
};

const parseFilterInputStub: ParseFilterInput = (raw) => {
  if (raw.tagsRaw.some((t) => t.trim() === "")) {
    return err({ kind: "invalid-tag", raw: "" });
  }
  const applied: AppliedFilter = {
    kind: "AppliedFilter",
    criteria: {
      tags: raw.tagsRaw.map((t) => mockTag(t)),
      frontmatterFields: raw.fieldsRaw,
    },
    query: raw.searchTextRaw
      ? ({
          text: raw.searchTextRaw,
          scope: "body+frontmatter",
        } satisfies SearchQuery)
      : null,
    sortOrder: raw.sortOrder,
  };
  return ok(applied);
};

const parsed = parseFilterInputStub(filterInput);
if (!parsed.ok) {
  throw new Error("simulation: parse must succeed");
}
const applied: AppliedFilter = parsed.value;
assertType<AppliedFilter>(applied);

// ──────────────────────────────────────────────────────────────────────
// applyFilterOrSearch スタブ: Pure（snapshots を絞り込み + ソート）
// ──────────────────────────────────────────────────────────────────────

const applyFilterOrSearchStub: ApplyFilterOrSearch = (
  feed,
  appliedFilter,
  snaps,
) => {
  const wantedTags = new Set(appliedFilter.criteria.tags as readonly string[]);
  const filtered = snaps.filter((s) => {
    if (wantedTags.size === 0) return true;
    return s.frontmatter.tags.some((t) => wantedTags.has(t as unknown as string));
  });
  const ids = filtered.map((s) => s.noteId);
  void feed;
  return {
    kind: "VisibleNoteIds",
    ids,
    hasZeroResults: ids.length === 0,
  };
};

const visible: VisibleNoteIds = applyFilterOrSearchStub(
  initialFeed,
  applied,
  snapshots,
);
assertType<VisibleNoteIds>(visible);

// シナリオ 5 期待: claude-code を持つノートだけ抽出
const _scenario5HasResults = !visible.hasZeroResults;
void _scenario5HasResults;

// ──────────────────────────────────────────────────────────────────────
// シナリオ 6: 存在しない検索語で 0 件結果
// ──────────────────────────────────────────────────────────────────────

const emptySearch: AppliedFilter = {
  kind: "AppliedFilter",
  criteria: { tags: [mockTag("xyzqwerty")], frontmatterFields: new Map() },
  query: { text: "xyzqwerty", scope: "body+frontmatter" },
  sortOrder,
};

const noResults: VisibleNoteIds = applyFilterOrSearchStub(
  initialFeed,
  emptySearch,
  snapshots,
);
const _scenario6Zero: boolean = noResults.hasZeroResults || (noResults.ids.length === 0);
void _scenario6Zero;

// ──────────────────────────────────────────────────────────────────────
// シナリオ 5 拡張: 異種条件併用（タグ + frontmatter field）
//   → criteria.tags と criteria.frontmatterFields を同時に持てることを型で確認
// ──────────────────────────────────────────────────────────────────────

const fields = new Map<string, string>([["status", "open"]]);
const combined: AppliedFilter = {
  kind: "AppliedFilter",
  criteria: { tags: [claudeTag, reviewTag], frontmatterFields: fields },
  query: null,
  sortOrder,
};
assertType<AppliedFilter>(combined);

// ──────────────────────────────────────────────────────────────────────
// 失敗パス: 空文字タグ
// ──────────────────────────────────────────────────────────────────────

const invalidInput: UnvalidatedFilterInput = {
  kind: "UnvalidatedFilterInput",
  tagsRaw: [""],
  fieldsRaw: new Map(),
  searchTextRaw: null,
  sortOrder,
};
const invalidParsed: Result<AppliedFilter, { kind: "invalid-tag"; raw: string }> =
  parseFilterInputStub(invalidInput);
assertType<Result<AppliedFilter, { kind: "invalid-tag"; raw: string }>>(
  invalidParsed,
);

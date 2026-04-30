/**
 * PROP-002 検証ハーネス — Phase 5 形式的強化
 *
 * 証明義務: hydrateFeed は破損ファイルのエントリを Feed.noteRefs から除外する。
 * corruptedFiles.map(f => f.filePath) ∩ feed.noteRefs.map(r => r) = ∅
 * (より正確には: noteRefs は入力スナップショットの NoteId のみから構成される)
 *
 * Tier 1 (fast-check, numRuns: 1000)
 * required: true
 */

import { test, expect } from "bun:test";
import * as fc from "fast-check";
import type { NoteFileSnapshot, CorruptedFile } from "promptnotes-domain-types/shared/snapshots";
import type { NoteId, Timestamp, Body, Frontmatter } from "promptnotes-domain-types/shared/value-objects";
import type { ScannedVault } from "$lib/domain/app-startup/stages";
import { hydrateFeed } from "$lib/domain/app-startup/hydrate-feed";

// ── テスト補助関数 ─────────────────────────────────────────────────────────

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeBody(raw: string): Body {
  return raw as unknown as Body;
}

function makeFrontmatter(createdMs: number, updatedMs: number): Frontmatter {
  return {
    tags: [],
    createdAt: makeTimestamp(createdMs),
    updatedAt: makeTimestamp(updatedMs),
  } as unknown as Frontmatter;
}

function makeSnapshot(
  noteIdStr: string,
  filePath: string,
  updatedMs: number
): NoteFileSnapshot {
  return {
    noteId: makeNoteId(noteIdStr),
    body: makeBody("body"),
    frontmatter: makeFrontmatter(1000, updatedMs),
    filePath,
    fileMtime: makeTimestamp(updatedMs),
  };
}

function makeScannedVault(
  snapshots: NoteFileSnapshot[],
  corruptedFiles: CorruptedFile[] = []
): ScannedVault {
  return {
    kind: "ScannedVault",
    snapshots,
    corruptedFiles,
  } as unknown as ScannedVault;
}

function makeCorruptedFile(filePath: string): CorruptedFile {
  return {
    filePath,
    failure: { kind: "read", fsError: { kind: "permission" } },
  };
}

// ── PROP-002: 破損ファイルの除外検証 (numRuns: 1000) ─────────────────────────

test("PROP-002: noteRefs は入力スナップショットの NoteId のみから構成される [numRuns=1000]", () => {
  // fast-check: 任意のスナップショット集合と破損ファイル集合に対して
  // noteRefs が入力スナップショットの NoteId のみを含むことを検証する。
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          noteIdStr: fc.string({ minLength: 20, maxLength: 25 }),
          updatedMs: fc.integer({ min: 1000, max: 9_999_999 }),
        }),
        { minLength: 0, maxLength: 8 }
      ),
      fc.array(
        fc.string({ minLength: 1, maxLength: 20 }).map((s) => `/vault/corrupt-${s}.md`),
        { minLength: 0, maxLength: 4 }
      ),
      (snapshotDefs, corruptedPaths) => {
        // noteId 重複排除
        const seen = new Set<string>();
        const snapshots: NoteFileSnapshot[] = snapshotDefs
          .filter((s) => {
            if (seen.has(s.noteIdStr)) return false;
            seen.add(s.noteIdStr);
            return true;
          })
          .map((s) => makeSnapshot(s.noteIdStr, `/vault/${s.noteIdStr}.md`, s.updatedMs));

        const inputNoteIds = new Set(snapshots.map((s) => s.noteId as unknown as string));
        const corruptedFiles = corruptedPaths.map(makeCorruptedFile);
        const result = hydrateFeed(makeScannedVault(snapshots, corruptedFiles));

        // PROP-002: 全ての noteRef は入力スナップショットの NoteId でなければならない
        for (const ref of result.feed.noteRefs) {
          const refStr = ref as unknown as string;
          if (!inputNoteIds.has(refStr)) return false;
        }

        // 追加確認: noteRefs の件数は入力スナップショット件数と等しい
        if (result.feed.noteRefs.length !== snapshots.length) return false;

        return true;
      }
    ),
    { numRuns: 1000 }
  );
});

test("PROP-002: 全破損の Vault → noteRefs は空", () => {
  // 全ファイルが破損している場合、Feed.noteRefs は空でなければならない。
  const c1 = makeCorruptedFile("/vault/a.md");
  const c2 = makeCorruptedFile("/vault/b.md");
  const c3 = makeCorruptedFile("/vault/c.md");
  const input = makeScannedVault([], [c1, c2, c3]);

  const result = hydrateFeed(input);

  expect(result.feed.noteRefs).toHaveLength(0);
  expect(result.corruptedFiles).toHaveLength(3);
});

test("PROP-002: 破損ファイルは TagInventory にも反映されない", () => {
  // REQ-009 AC: 破損ファイルのタグは TagInventory に含まれない。
  const c1 = makeCorruptedFile("/vault/bad.md");
  const input = makeScannedVault([], [c1]);

  const result = hydrateFeed(input);

  expect(result.tagInventory.entries).toHaveLength(0);
});

test("PROP-002: 混合 Vault — 正常ファイルは noteRefs に含まれ、破損ファイルは除外される", () => {
  const good = makeSnapshot("2026-04-28-120000-001", "/vault/good.md", 2000);
  const bad = makeCorruptedFile("/vault/bad.md");
  const input = makeScannedVault([good], [bad]);

  const result = hydrateFeed(input);

  const noteRefStrs = result.feed.noteRefs.map((id) => id as unknown as string);
  expect(noteRefStrs).toContain("2026-04-28-120000-001");
  expect(noteRefStrs).not.toContain("/vault/bad.md");
  expect(result.corruptedFiles).toHaveLength(1);
});

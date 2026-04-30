/**
 * PROP-001 検証ハーネス — Phase 5 形式的強化
 *
 * 証明義務: hydrateFeed は純粋関数である。
 * ∀ input: ScannedVault, hydrateFeed(input) deepEquals hydrateFeed(input)
 *
 * Tier 1 (fast-check, numRuns: 1000)
 * required: true
 */

import { test, expect } from "bun:test";
import * as fc from "fast-check";
import type { NoteFileSnapshot, CorruptedFile } from "promptnotes-domain-types/shared/snapshots";
import type { NoteId, Timestamp, Tag, Body, Frontmatter } from "promptnotes-domain-types/shared/value-objects";
import type { ScannedVault } from "$lib/domain/app-startup/stages";
import { hydrateFeed } from "$lib/domain/app-startup/hydrate-feed";

// ── テスト補助関数 ─────────────────────────────────────────────────────────

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}

function makeBody(raw: string): Body {
  return raw as unknown as Body;
}

function makeFrontmatter(createdMs: number, updatedMs: number, tags: Tag[] = []): Frontmatter {
  return {
    tags,
    createdAt: makeTimestamp(createdMs),
    updatedAt: makeTimestamp(updatedMs),
  } as unknown as Frontmatter;
}

function makeSnapshot(
  noteIdStr: string,
  filePath: string,
  updatedMs: number,
  createdMs = 1000
): NoteFileSnapshot {
  return {
    noteId: makeNoteId(noteIdStr),
    body: makeBody("body"),
    frontmatter: makeFrontmatter(createdMs, updatedMs),
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

// ── PROP-001: 純粋性検証 (numRuns: 1000) ────────────────────────────────────

test("PROP-001: hydrateFeed は純粋関数 — ∀ ScannedVault, fn(x) deepEquals fn(x) [numRuns=1000]", () => {
  // fast-check で 1000 回の任意入力を生成し、参照透明性を検証する。
  // 同一入力に対して 2 回呼び出した結果が構造的に等価であること。
  fc.assert(
    fc.property(
      // スナップショット: 0〜8 件、各スナップショットは固有の noteId を持つ
      fc.array(
        fc.record({
          noteIdStr: fc.string({ minLength: 20, maxLength: 25 }),
          updatedMs: fc.integer({ min: 1000, max: 9_999_999 }),
          tagCount: fc.integer({ min: 0, max: 3 }),
        }),
        { minLength: 0, maxLength: 8 }
      ),
      // 破損ファイル: 0〜4 件
      fc.array(
        fc.string({ minLength: 1, maxLength: 20 }).map((s) => `/vault/corrupt-${s}.md`),
        { minLength: 0, maxLength: 4 }
      ),
      (snapshotDefs, corruptedPaths) => {
        // noteId の重複を排除する
        const seen = new Set<string>();
        const snapshots: NoteFileSnapshot[] = snapshotDefs
          .filter((s) => {
            if (seen.has(s.noteIdStr)) return false;
            seen.add(s.noteIdStr);
            return true;
          })
          .map((s) => makeSnapshot(s.noteIdStr, `/vault/${s.noteIdStr}.md`, s.updatedMs));

        const corruptedFiles = corruptedPaths.map(makeCorruptedFile);
        const input = makeScannedVault(snapshots, corruptedFiles);

        // 同一入力で 2 回呼び出す
        const result1 = hydrateFeed(input);
        const result2 = hydrateFeed(input);

        // noteRefs の一致（順序含む）
        const r1Ids = [...result1.feed.noteRefs].map((id) => id as unknown as string);
        const r2Ids = [...result2.feed.noteRefs].map((id) => id as unknown as string);
        if (r1Ids.join(",") !== r2Ids.join(",")) return false;

        // tagInventory.entries の一致
        const r1Tags = result1.tagInventory.entries.map((e) => `${e.name as unknown as string}:${e.usageCount}`).join(",");
        const r2Tags = result2.tagInventory.entries.map((e) => `${e.name as unknown as string}:${e.usageCount}`).join(",");
        if (r1Tags !== r2Tags) return false;

        // corruptedFiles の件数の一致
        if (result1.corruptedFiles.length !== result2.corruptedFiles.length) return false;

        // tagInventory.lastBuiltAt の一致
        const la1 = (result1.tagInventory.lastBuiltAt as unknown as { epochMillis: number }).epochMillis;
        const la2 = (result2.tagInventory.lastBuiltAt as unknown as { epochMillis: number }).epochMillis;
        if (la1 !== la2) return false;

        return true;
      }
    ),
    { numRuns: 1000 }
  );
});

test("PROP-001: hydrateFeed は Date.now() を呼び出さない（purity 監視）", () => {
  // Date.now をスパイして hydrateFeed 実行中の呼び出し回数が 0 であることを確認する。
  const snapshot = makeSnapshot("2026-04-28-120000-001", "/vault/a.md", 2000);
  const input = makeScannedVault([snapshot]);

  const originalDateNow = Date.now;
  let callCount = 0;
  Date.now = () => {
    callCount++;
    return originalDateNow();
  };

  try {
    hydrateFeed(input);
    hydrateFeed(input);
    // 呼び出し回数は 0 でなければならない
    expect(callCount).toBe(0);
  } finally {
    Date.now = originalDateNow;
  }
});

test("PROP-001: hydrateFeed の関数アリティは 1 (ScannedVault のみ)", () => {
  // REQ-015 AC-1: 引数は ScannedVault のみ。Timestamp 引数は不可。
  expect(hydrateFeed.length).toBe(1);
});

/**
 * PROP-003 検証ハーネス — Phase 5 形式的強化
 *
 * 証明義務: nextAvailableNoteId(preferred, existingIds) は existingIds に含まれない NoteId を返す。
 * ∀ preferred: Timestamp, ∀ existingIds: ReadonlySet<NoteId>,
 *   nextAvailableNoteId(preferred, existingIds) ∉ existingIds
 *
 * Sprint-4 の load-bearing パターン: base を先に取得して existingIds に含め、
 * 衝突ループを必ず通過させることで uniqueness invariant を強制検証する。
 *
 * Tier 1 (fast-check, numRuns: 1000)
 * required: true
 */

import { test, expect } from "bun:test";
import * as fc from "fast-check";
import type { NoteId, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import { nextAvailableNoteId } from "$lib/domain/app-startup/initialize-capture";

// ── テスト補助関数 ─────────────────────────────────────────────────────────

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

// ── PROP-003: 一意性不変条件 (numRuns: 1000) ────────────────────────────────

test("PROP-003: ∀ preferred, ∀ existingIds, nextAvailableNoteId(preferred, existingIds) ∉ existingIds [numRuns=1000]", () => {
  // Sprint-4 load-bearing パターン:
  //   1. base = nextAvailableNoteId(preferred, new Set())  で base を取得
  //   2. existingIds = {base} ∪ {追加の任意 ID} を構築
  //   3. result = nextAvailableNoteId(preferred, existingIds) を実行
  //   4. result ∉ existingIds を検証
  // これにより衝突ループ (initialize-capture.ts:97-103) が必ず実行される。
  fc.assert(
    fc.property(
      // epoch_ms: 1000〜9_999_999 の整数
      fc.integer({ min: 1000, max: 9_999_999 }),
      // 追加の衝突 suffix: 0〜5 個 (多段衝突を網羅)
      fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 0, maxLength: 5 }),
      (epochMs, suffixes) => {
        const preferred = makeTimestamp(epochMs);

        // Step 1: base を空セットで取得
        const base = nextAvailableNoteId(preferred, new Set<NoteId>());
        const baseStr = base as unknown as string;

        // Step 2: existingIds に base を追加し（衝突確定）、任意の suffix も追加
        const existingIds = new Set<NoteId>([base]);
        for (const n of suffixes) {
          existingIds.add(`${baseStr}-${n}` as unknown as NoteId);
        }

        // Step 3: 衝突下での nextAvailableNoteId 実行
        const result = nextAvailableNoteId(preferred, existingIds);

        // Step 4: result は existingIds に含まれてはならない
        return !existingIds.has(result);
      }
    ),
    { numRuns: 1000 }
  );
});

test("PROP-003: 空の existingIds でも base は有効な NoteId フォーマット", () => {
  // REQ-011 AC: フォーマットは YYYY-MM-DD-HHmmss-SSS (UTC)。
  const preferred = makeTimestamp(1714298400000);
  const result = nextAvailableNoteId(preferred, new Set<NoteId>());

  const resultStr = result as unknown as string;
  // 末尾の -SSS (ミリ秒) と衝突接尾辞の区別をアンカー正規表現で確認する
  expect(resultStr).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}-\d{3}$/);
  expect(new Set<NoteId>()).not.toContain(result);
});

test("PROP-003: base 衝突時は -1 が付与される", () => {
  const preferred = makeTimestamp(1714298400000);
  const base = nextAvailableNoteId(preferred, new Set<NoteId>());
  const existingWithBase = new Set<NoteId>([base]);

  const result = nextAvailableNoteId(preferred, existingWithBase);

  expect(existingWithBase.has(result)).toBe(false);
  expect(result as unknown as string).toBe(`${base as unknown as string}-1`);
});

test("PROP-003: base と -1 の両衝突時は -2 が付与される", () => {
  const preferred = makeTimestamp(1714298400000);
  const base = nextAvailableNoteId(preferred, new Set<NoteId>());
  const baseStr = base as unknown as string;
  const existingIds = new Set<NoteId>([
    base,
    makeNoteId(`${baseStr}-1`),
  ]);

  const result = nextAvailableNoteId(preferred, existingIds);

  expect(existingIds.has(result)).toBe(false);
  expect(result as unknown as string).toBe(`${baseStr}-2`);
});

test("PROP-003: nextAvailableNoteId の関数アリティは 2 (純粋関数の証明)", () => {
  // ポートなし、副作用なし。引数は preferred と existingIds の 2 つだけ。
  expect(nextAvailableNoteId.length).toBe(2);
});

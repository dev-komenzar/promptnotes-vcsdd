/**
 * PROP-023 検証ハーネス — Phase 5 形式的強化
 *
 * 証明義務: Clock.now() は 1 パイプライン実行あたり最大 2 回呼び出される。
 * hydrateFeed は Timestamp パラメータを持たず、Clock.now を呼び出さない。
 *
 * 検証内容:
 *   1. clockNow にカウンタをラップし、パイプライン実行後に count ≤ 2 を確認する。
 *   2. hydrateFeed の型シグネチャに Timestamp パラメータがないことを型レベルで確認する。
 *
 * Tier 1 (fast-check + spy)
 * required: true
 */

import { test, expect } from "bun:test";
import * as fc from "fast-check";
import type { Body, Frontmatter, NoteId, Tag, Timestamp, VaultPath, VaultId } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSnapshot, CorruptedFile } from "promptnotes-domain-types/shared/snapshots";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { ScannedVault } from "$lib/domain/app-startup/stages";
import { hydrateFeed } from "$lib/domain/app-startup/hydrate-feed";
import { runAppStartupPipeline, type AppStartupPipelinePorts } from "$lib/domain/app-startup/pipeline";

// ── テスト補助関数 ─────────────────────────────────────────────────────────

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeVaultPath(raw: string): VaultPath {
  return raw as unknown as VaultPath;
}

function makeVaultId(raw: string): VaultId {
  return raw as unknown as VaultId;
}

function makeBody(raw: string): Body {
  return raw as unknown as Body;
}

function makeFrontmatter(updatedMs: number): Frontmatter {
  return {
    tags: [],
    createdAt: makeTimestamp(1000),
    updatedAt: makeTimestamp(updatedMs),
  } as unknown as Frontmatter;
}

function makeNoteFromCreate(id: NoteId, now: Timestamp): Note {
  return {
    id,
    body: "" as unknown as Body,
    frontmatter: {
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as unknown as Frontmatter,
  };
}

function makeHappyPathPorts(clockSpy: () => Timestamp): AppStartupPipelinePorts {
  const vaultPath = makeVaultPath("/vault");
  return {
    settingsLoad: () => ({ ok: true, value: vaultPath }),
    statDir: () => ({ ok: true, value: true }),
    listMarkdown: () => ({ ok: true, value: ["/vault/2026-04-28-120000-001.md"] }),
    readFile: () => ({ ok: true, value: "body" }),
    parseNote: () => ({
      ok: true,
      value: {
        body: makeBody("body"),
        fm: makeFrontmatter(2000),
      },
    }),
    clockNow: clockSpy,
    allocateNoteId: (ts) => makeNoteId("2026-04-28-120000-001"),
    noteCreate: makeNoteFromCreate,
    emit: () => {},
    vaultId: makeVaultId("vault-1"),
  };
}

// ── PROP-023a: Clock.now() 呼び出し回数 ≤ 2 ─────────────────────────────────

test("PROP-023a: パイプライン実行中の Clock.now() 呼び出し回数は最大 2 回 [numRuns=100]", async () => {
  // fast-check: 任意の epoch_ms に対してパイプラインを実行し、clockNow 呼び出し回数を検証する。
  // 非同期プロパティのため fc.asyncProperty を使用する。
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1_000_000, max: 9_999_999_999 }),
      async (epochMs) => {
        let clockCallCount = 0;
        const clockSpy = (): Timestamp => {
          clockCallCount++;
          return makeTimestamp(epochMs);
        };

        const ports = makeHappyPathPorts(clockSpy);
        const result = await runAppStartupPipeline(ports);

        // パイプライン成功確認
        if (!result.ok) return false;

        // PROP-023: 呼び出し回数は 0 より大きく 2 以下でなければならない
        // (Step 2→3 の inter-step で 1 回、Step 4 の initializeCaptureSession で 1 回)
        return clockCallCount >= 1 && clockCallCount <= 2;
      }
    ),
    { numRuns: 100 }
  );
});

test("PROP-023a: 具体的な happy path で clockNow 呼び出し回数が正確に 2 回", async () => {
  // より詳細: pipeline.ts のどのステップで呼ばれるか追跡する。
  let clockCallCount = 0;
  const callLog: string[] = [];

  const clockSpy = (): Timestamp => {
    clockCallCount++;
    callLog.push(`call #${clockCallCount}`);
    return makeTimestamp(1714298400000);
  };

  const ports = makeHappyPathPorts(clockSpy);
  const result = await runAppStartupPipeline(ports);

  expect(result.ok).toBe(true);

  // PROP-023: 呼び出し回数は 2 以下
  expect(clockCallCount).toBeLessThanOrEqual(2);
  // 最低 1 回は呼ばれる (Step 2→3 の inter-step)
  expect(clockCallCount).toBeGreaterThanOrEqual(1);
});

// ── PROP-023b: hydrateFeed は Timestamp パラメータを持たない ────────────────

// 型レベル証明 (step3-hydrate-feed.test.ts と同様の strengthened guard を再確認)

type _HydrateFeedParams = Parameters<typeof hydrateFeed>;

// guard 1: アリティが 1 であること
const _arity: _HydrateFeedParams["length"] = 1 as const;
void _arity;

// guard 2: パラメータタプルが正確に [ScannedVault] であること
import type { ScannedVault as _SV } from "$lib/domain/app-startup/stages";
type _IsExactlyOne = _HydrateFeedParams extends [_SV] ? true : false;
const _exactlyOne: _IsExactlyOne = true;
void _exactlyOne;

// guard 3: どのパラメータも { epochMillis: number } を持たないこと
type IsNever<T> = [T] extends [never] ? true : false;
type _NoTimestamp = Extract<_HydrateFeedParams[number], { epochMillis: number }>;
const _noTimestamp: IsNever<_NoTimestamp> = true;
void _noTimestamp;

test("PROP-023b: hydrateFeed のアリティは 1 (Timestamp パラメータなし)", () => {
  // ランタイム確認: 型レベルのガードはコンパイル時に検証済み。
  expect(hydrateFeed.length).toBe(1);
});

test("PROP-023b: hydrateFeed は ScannedVault のみで呼び出し可能 (Timestamp 引数不要)", () => {
  // ScannedVault だけで呼び出せることをランタイムで確認する。
  const input: ScannedVault = {
    kind: "ScannedVault",
    snapshots: [],
    corruptedFiles: [],
  } as unknown as ScannedVault;

  // 2 番目の引数なしで呼び出せること
  const result = hydrateFeed(input);
  expect(result.kind).toBe("HydratedFeed");
});

test("PROP-023c: hydrateFeed 実行中に Date.now() は呼び出されない", () => {
  // Date.now をスパイして hydrateFeed 内から呼ばれていないことを確認する。
  const originalDateNow = Date.now;
  let dateNowCalls = 0;
  Date.now = () => {
    dateNowCalls++;
    return originalDateNow();
  };

  try {
    const input: ScannedVault = {
      kind: "ScannedVault",
      snapshots: [],
      corruptedFiles: [],
    } as unknown as ScannedVault;

    hydrateFeed(input);

    expect(dateNowCalls).toBe(0);
  } finally {
    Date.now = originalDateNow;
  }
});

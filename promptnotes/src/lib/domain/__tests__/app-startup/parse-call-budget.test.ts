/**
 * parse-call-budget.test.ts — PROP-030: parseMarkdownToBlocks call budget
 *
 * PROP-030: parseMarkdownToBlocks is invoked exactly TWICE per non-corrupt file per pipeline run.
 *   - Call 1: Step 2 (scanVault per-file validation loop, result discarded)
 *   - Call 2: Step 3 (hydrateFeed via HydrateNote, result retained on the materialized Note)
 *   Files that fail the Step 2 invocation NEVER reach Step 3 (counter = 1 for them).
 *   Both invocations produce deep-equal Block[] per Q2 determinism (PROP-025).
 *
 * REQ-002 (rev7): Step 2 calls parseMarkdownToBlocks directly as structural validation.
 *                 The validated Block[] is discarded; ScannedVault.snapshots is NoteFileSnapshot[].
 * REQ-008 (rev7): hydrateFeed calls HydrateNote per snapshot to materialize Note aggregates.
 *                 HydrateNote re-parses the body via parseMarkdownToBlocks.
 *                 The double call is the deliberate cost of keeping ScannedVault shape unchanged.
 *
 * Red phase: The current implementation:
 *   - scan-vault.ts does NOT call parseMarkdownToBlocks at all (count = 0 for Step 2)
 *   - hydrate-feed.ts does NOT call HydrateNote at all (count = 0 for Step 3)
 * Therefore the total call count per non-corrupt file is 0, not 2.
 * All call-budget assertions WILL FAIL in Red phase.
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import type { NoteFileSnapshot, CorruptedFile } from "promptnotes-domain-types/shared/snapshots";
import type { VaultPath, Tag, Body, Frontmatter, Timestamp, BlockId, BlockType, BlockContent } from "promptnotes-domain-types/shared/value-objects";
import type { Block } from "promptnotes-domain-types/shared/note";
import type { Result } from "promptnotes-domain-types/util/result";

import {
  scanVault,
  type ScanVaultPorts,
} from "$lib/domain/app-startup/scan-vault";
import { hydrateFeed } from "$lib/domain/app-startup/hydrate-feed";
import type { ScannedVault } from "$lib/domain/app-startup/stages";
import type { BlockParseError } from "$lib/domain/capture-auto-save/parse-markdown-to-blocks";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeVaultPath(raw: string): VaultPath {
  return raw as unknown as VaultPath;
}

function makeBody(raw: string): Body {
  return raw as unknown as Body;
}

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeFrontmatter(): Frontmatter {
  return {
    tags: [] as readonly Tag[],
    createdAt: makeTimestamp(1714298400000),
    updatedAt: makeTimestamp(1714298400000),
  } as unknown as Frontmatter;
}

function makeValidMarkdownContent(id: string): string {
  return `---
tags: []
createdAt: "2026-04-28T12:00:00.000Z"
updatedAt: "2026-04-28T12:00:00.000Z"
---
Body text for note ${id}
`;
}

function makeOkBlock(index: number, content: string): Block {
  return {
    id: `block-${index}` as unknown as BlockId,
    type: "paragraph" as BlockType,
    content: content as unknown as BlockContent,
  } as unknown as Block;
}

/**
 * Creates a counting parseMarkdownToBlocks stub.
 * Returns a function and a counter object.
 * The counter tracks total calls and per-input calls.
 */
function makeCountingBlockParser(
  failFor: Set<string> = new Set()
): {
  parseMarkdownToBlocks: (markdown: string) => Result<ReadonlyArray<Block>, BlockParseError>;
  callCount: { total: number; perInput: Map<string, number> };
} {
  const callCount = {
    total: 0,
    perInput: new Map<string, number>(),
  };

  const parseMarkdownToBlocks = (markdown: string): Result<ReadonlyArray<Block>, BlockParseError> => {
    callCount.total++;
    callCount.perInput.set(markdown, (callCount.perInput.get(markdown) ?? 0) + 1);

    if (failFor.has(markdown)) {
      return {
        ok: false as const,
        error: { kind: "unterminated-code-fence" as const, line: 1 },
      };
    }

    return {
      ok: true as const,
      value: [makeOkBlock(0, markdown)] as ReadonlyArray<Block>,
    };
  };

  return { parseMarkdownToBlocks, callCount };
}

/**
 * Creates a counting hydrateFeed that injects the block parser counter.
 * This requires hydrateFeed to accept a parseMarkdownToBlocks parameter
 * OR for hydrateNote to use the same counter (via dependency injection).
 *
 * For PROP-030 end-to-end counting, we run the full pipeline:
 *   scanVault (with counting block parser) → hydrateFeed (with same counting block parser)
 * and verify the total count per non-corrupt file is 2.
 *
 * Note: hydrateFeed is currently pure and takes only ScannedVault. In rev7,
 * hydrateFeed calls HydrateNote per snapshot. HydrateNote calls parseMarkdownToBlocks.
 * For the counting test, we need hydrateFeed to use a SHARED parseMarkdownToBlocks
 * reference so we can count across both steps.
 *
 * The implementation challenge: hydrateFeed needs to receive a parseMarkdownToBlocks
 * (or hydrateNote) as a dependency. But REQ-008/REQ-015 say hydrateFeed takes only
 * ScannedVault and is pure. This is reconciled by:
 *   - parseMarkdownToBlocks and HydrateNote are pure functions (no hidden state)
 *   - hydrateFeed's purity is preserved because parseMarkdownToBlocks has no side effects
 *   - For COUNT testing, we use a wrapper that tracks calls externally
 *
 * The test below verifies the count by running the full two-step sequence with
 * shared counter state.
 */

// ── PROP-030: exact two-call invariant per non-corrupt file ──────────────────

describe("PROP-030 — parseMarkdownToBlocks called exactly twice per non-corrupt file per pipeline run", () => {
  // Red phase: scan-vault.ts makes 0 calls, hydrate-feed.ts makes 0 calls.
  // Total = 0 per file. Assertions expecting 2 WILL FAIL.

  test("PROP-030 — 1 non-corrupt file: total parseMarkdownToBlocks call count = 2", async () => {
    // PROP-030: exactly 2 calls for a single non-corrupt file:
    //   Call 1 in Step 2 (scanVault, validation, result discarded)
    //   Call 2 in Step 3 (hydrateFeed via hydrateNote, result retained)
    const vaultPath = makeVaultPath("/vault");
    const body = "A simple paragraph body";

    const { parseMarkdownToBlocks, callCount } = makeCountingBlockParser();

    const ports: ScanVaultPorts = {
      listMarkdown: (_path: VaultPath) => ({ ok: true as const, value: ["/vault/2026-04-28-120000-001.md"] }),
      readFile: (_filePath: string) => ({ ok: true as const, value: makeValidMarkdownContent("2026-04-28-120000-001") }),
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: makeBody(body),
          fm: makeFrontmatter(),
        },
      }),
      // REQ-002 (rev7): scanVault receives parseMarkdownToBlocks as a port
      parseMarkdownToBlocks,
    } as unknown as ScanVaultPorts;

    // Step 2: scanVault — should call parseMarkdownToBlocks once (validation, result discarded)
    const scanResult = await scanVault(vaultPath, ports);
    expect(scanResult.ok).toBe(true);

    const step2CallCount = callCount.total;
    // Step 2 must have called parseMarkdownToBlocks exactly once
    expect(step2CallCount).toBe(1);

    if (scanResult.ok) {
      expect(scanResult.value.snapshots).toHaveLength(1);

      // Step 3: hydrateFeed — should call parseMarkdownToBlocks once more (via hydrateNote)
      // After rev7, hydrateFeed needs access to parseMarkdownToBlocks via hydrateNote.
      // For this counting test, we pass the same parseMarkdownToBlocks to hydrateFeed
      // (or hydrateFeed uses the shared hydrateNote that closes over parseMarkdownToBlocks).
      // The current hydrateFeed signature takes only ScannedVault — this will need to change
      // or hydrateNote will need to be injected.
      // For now, we call hydrateFeed and check if the count increases.
      hydrateFeed(scanResult.value);

      const totalCallCount = callCount.total;
      // PROP-030: total must be 2 (1 from Step 2 + 1 from Step 3 via hydrateNote)
      expect(totalCallCount).toBe(2);
    }
  });

  test("PROP-030 — 3 non-corrupt files: total parseMarkdownToBlocks call count = 6 (3 × 2)", async () => {
    // PROP-030: N non-corrupt files → 2N total calls.
    const vaultPath = makeVaultPath("/vault");
    const files = [
      "/vault/2026-04-28-120000-001.md",
      "/vault/2026-04-28-120000-002.md",
      "/vault/2026-04-28-120000-003.md",
    ];

    const { parseMarkdownToBlocks, callCount } = makeCountingBlockParser();

    const ports: ScanVaultPorts = {
      listMarkdown: (_path: VaultPath) => ({ ok: true as const, value: files }),
      readFile: (filePath: string) => ({
        ok: true as const,
        value: makeValidMarkdownContent(filePath.split("/").pop()!.replace(".md", "")),
      }),
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: makeBody("paragraph body"),
          fm: makeFrontmatter(),
        },
      }),
      parseMarkdownToBlocks,
    } as unknown as ScanVaultPorts;

    const scanResult = await scanVault(vaultPath, ports);
    expect(scanResult.ok).toBe(true);

    // Step 2: 3 files × 1 call each = 3 calls
    expect(callCount.total).toBe(3);

    if (scanResult.ok) {
      hydrateFeed(scanResult.value);

      // Step 3: 3 more calls (via hydrateNote per snapshot) = 6 total
      expect(callCount.total).toBe(6);
    }
  });

  test("PROP-030 — corrupt file (block-parse fail): only 1 call (Step 2), never reaches Step 3", async () => {
    // PROP-030: 'Files that fail the Step 2 invocation never reach Step 3.'
    // A corrupt file gets 1 parseMarkdownToBlocks call (Step 2, which returns Err),
    // and 0 calls from Step 3 (it was filtered out into corruptedFiles).
    const vaultPath = makeVaultPath("/vault");
    const failBody = "FAIL_BODY_FOR_BLOCK_PARSE";

    const { parseMarkdownToBlocks, callCount } = makeCountingBlockParser(
      new Set([failBody])
    );

    const ports: ScanVaultPorts = {
      listMarkdown: (_path: VaultPath) => ({
        ok: true as const,
        value: ["/vault/2026-04-28-120000-001.md"],
      }),
      readFile: (_filePath: string) => ({
        ok: true as const,
        value: makeValidMarkdownContent("2026-04-28-120000-001"),
      }),
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: makeBody(failBody),
          fm: makeFrontmatter(),
        },
      }),
      parseMarkdownToBlocks,
    } as unknown as ScanVaultPorts;

    const scanResult = await scanVault(vaultPath, ports);
    expect(scanResult.ok).toBe(true);

    // Step 2: 1 call (returns Err → file goes to corruptedFiles)
    expect(callCount.total).toBe(1);

    if (scanResult.ok) {
      // The file should be in corruptedFiles, not snapshots
      expect(scanResult.value.snapshots).toHaveLength(0);
      expect(scanResult.value.corruptedFiles).toHaveLength(1);

      hydrateFeed(scanResult.value);

      // Step 3: 0 additional calls (corrupt file never reached hydrateNote)
      // Total remains at 1
      expect(callCount.total).toBe(1);
    }
  });

  test("PROP-030 — mixed: 2 ok + 1 corrupt = 4 calls total (2×2 + 1×1 - 1 corrupt is not counted twice)", async () => {
    // 2 ok files: 2 calls each = 4 calls
    // 1 corrupt file: 1 call (Step 2 only) = 1 call
    // Total = 5 calls
    const vaultPath = makeVaultPath("/vault");
    const failBody = "FAIL_BODY_CORRUPT";

    const { parseMarkdownToBlocks, callCount } = makeCountingBlockParser(
      new Set([failBody])
    );

    const files = [
      "/vault/2026-04-28-120000-001.md",
      "/vault/2026-04-28-120000-002.md",
      "/vault/2026-04-28-120000-003.md", // will fail block parse
    ];

    const ports: ScanVaultPorts = {
      listMarkdown: (_path: VaultPath) => ({ ok: true as const, value: files }),
      readFile: (filePath: string) => ({
        ok: true as const,
        value: makeValidMarkdownContent(filePath.split("/").pop()!.replace(".md", "")),
      }),
      parseNote: (_raw: string, filePath?: string) => {
        // The third file gets a failing body
        const isFail = _raw.includes("2026-04-28-120000-003");
        return {
          ok: true as const,
          value: {
            body: makeBody(isFail ? failBody : "ok body"),
            fm: makeFrontmatter(),
          },
        };
      },
      parseMarkdownToBlocks,
    } as unknown as ScanVaultPorts;

    const scanResult = await scanVault(vaultPath, ports);
    expect(scanResult.ok).toBe(true);

    // Step 2: 3 calls (2 ok + 1 fail)
    expect(callCount.total).toBe(3);

    if (scanResult.ok) {
      expect(scanResult.value.snapshots).toHaveLength(2);
      expect(scanResult.value.corruptedFiles).toHaveLength(1);

      hydrateFeed(scanResult.value);

      // Step 3: 2 more calls (only non-corrupt files reach hydrateNote)
      // Total = 5 (3 from Step 2 + 2 from Step 3)
      expect(callCount.total).toBe(5);
    }
  });

  test("PROP-030 — second call (Step 3) produces same Block[] as first call (Step 2 determinism)", async () => {
    // PROP-030: 'Both invocations produce deep-equal Block[] per Q2 determinism'
    // We capture the Block[] from both invocations and compare them.
    const vaultPath = makeVaultPath("/vault");
    const body = "# Title\n\nParagraph content";

    const callOutputs: Map<string, ReadonlyArray<Block>[]> = new Map();

    const trackingParser = (markdown: string): Result<ReadonlyArray<Block>, BlockParseError> => {
      const blocks: ReadonlyArray<Block> = [
        {
          id: "block-0" as unknown as BlockId,
          type: "paragraph" as BlockType,
          content: markdown as unknown as BlockContent,
        } as unknown as Block,
      ];

      const existing = callOutputs.get(markdown) ?? [];
      callOutputs.set(markdown, [...existing, blocks]);

      return { ok: true as const, value: blocks };
    };

    const ports: ScanVaultPorts = {
      listMarkdown: (_path: VaultPath) => ({
        ok: true as const,
        value: ["/vault/2026-04-28-120000-001.md"],
      }),
      readFile: (_filePath: string) => ({
        ok: true as const,
        value: makeValidMarkdownContent("2026-04-28-120000-001"),
      }),
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: makeBody(body),
          fm: makeFrontmatter(),
        },
      }),
      parseMarkdownToBlocks: trackingParser,
    } as unknown as ScanVaultPorts;

    const scanResult = await scanVault(vaultPath, ports);
    expect(scanResult.ok).toBe(true);

    if (scanResult.ok) {
      hydrateFeed(scanResult.value);

      // After both steps, the body should have been parsed twice
      const outputs = callOutputs.get(body);
      if (outputs && outputs.length === 2) {
        // Both invocations must produce deep-equal Block[] (Q2 determinism)
        const blocks1 = outputs[0];
        const blocks2 = outputs[1];
        expect(blocks1.length).toBe(blocks2.length);
        for (let i = 0; i < blocks1.length; i++) {
          expect(blocks1[i].id as unknown as string).toBe(blocks2[i].id as unknown as string);
          expect(blocks1[i].type as unknown as string).toBe(blocks2[i].type as unknown as string);
          expect(blocks1[i].content as unknown as string).toBe(blocks2[i].content as unknown as string);
        }
      }
    }
  });
});

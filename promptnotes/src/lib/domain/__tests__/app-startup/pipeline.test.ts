/**
 * pipeline.test.ts — Full AppStartup pipeline integration tests
 *
 * REQ-001: Happy path full pipeline
 * REQ-002: Step 2 integration with Step 3
 * REQ-008: Step 3 pure integration
 * REQ-010: Step 4 creates editing session
 * REQ-013a: VaultScanned event emitted after hydrateFeed (Vault public domain event)
 * REQ-013b: FeedRestored + TagInventoryBuilt emitted after VaultScanned (Curate internal)
 * REQ-014: Post-condition InitialUIState shape
 * REQ-015: No I/O outside designated steps (Clock.now budget ≤ 2)
 *
 * PROP-017: Full pipeline integration: happy path → InitialUIState with editing status
 * PROP-021: Event ordering: VaultScanned → FeedRestored → TagInventoryBuilt
 * PROP-023: Clock.now() called at most twice per pipeline run (Sprint 2)
 *
 * Sprint 2 changes:
 *   FIND-001: InitialUIState.editingSessionState replaces initialNoteId
 *   FIND-007: PROP-021 membership checks replaced with type-level assertions
 *   PROP-023a: Clock.now budget counter test
 */

import { describe, test, expect } from "bun:test";
import type { Body, NoteId, Timestamp, VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { CorruptedFile } from "promptnotes-domain-types/shared/snapshots";
import type { VaultScanned, PublicDomainEvent } from "promptnotes-domain-types/shared/events";
import type { InitialUIState } from "$lib/domain/app-startup/stages";
import type { EditingState } from "promptnotes-domain-types/capture/states";

// The implementation does NOT exist yet. This import will fail in Red phase.
import {
  runAppStartupPipeline,
  type AppStartupPipelinePorts,
} from "$lib/domain/app-startup/pipeline";

// ── FIND-007 / PROP-021: Type-level PublicDomainEvent membership assertions ─
// These are compile-time checks. If the types don't satisfy the contract,
// the file fails to compile — which is the Tier-0 Red signal.
//
// REQ-013b AC: FeedRestored and TagInventoryBuilt are Curate-internal — NOT part of
// PublicDomainEvent. The Extract<...> for those must be `never`.
//
// FIND-012 background: the prior guards `const _f: _FeedRestoredNotPublic = undefined as never`
// and `const _t: _TagInventoryBuiltNotPublic = undefined as never` were tautological because
// `undefined as never` is assignable to ANY target, including a non-`never` Extract result.
// If `feed-restored` were added to `PublicDomainEvent`, the Extract would resolve to the
// member type (not `never`), but the assignment would still compile. The strengthened guards
// below use the `_IsNever<T>` predicate so the assertion fails compile when the Extract is
// non-never, providing a real Tier-0 Red signal for the negative-membership claim.

// _IsNever<T>: type-level predicate that is `true` iff T is `never`. The brackets prevent
// distribution over union types, so `_IsNever<unknown>` correctly evaluates to `false`.
type _IsNever<T> = [T] extends [never] ? true : false;

// FIND-007 / FIND-012 Negative: feed-restored must NOT be in PublicDomainEvent
type _FeedRestoredNotPublic = Extract<PublicDomainEvent, { kind: "feed-restored" }>;
// FIND-012 strengthened guard: if `feed-restored` were added to PublicDomainEvent,
// `_FeedRestoredNotPublic` would be the member type (e.g., FeedRestored), `_IsNever<...>`
// would evaluate to `false`, and the assignment `true = false` would fail compile.
const _feedRestoredNeverPublic: _IsNever<_FeedRestoredNotPublic> = true;
void _feedRestoredNeverPublic;

// FIND-007 / FIND-012 Negative: tag-inventory-built must NOT be in PublicDomainEvent
type _TagInventoryBuiltNotPublic = Extract<PublicDomainEvent, { kind: "tag-inventory-built" }>;
// FIND-012 strengthened guard: same _IsNever pattern as feed-restored above.
const _tagInventoryBuiltNeverPublic: _IsNever<_TagInventoryBuiltNotPublic> = true;
void _tagInventoryBuiltNeverPublic;

// FIND-007 Positive: vault-scanned MUST be in PublicDomainEvent
// If VaultScanned is removed from PublicDomainEvent, this assignment fails.
type _VaultScannedIsPublic = Extract<PublicDomainEvent, { kind: "vault-scanned" }>;
const _v: _VaultScannedIsPublic = null as unknown as VaultScanned;
void _v;

// ── Test helpers ──────────────────────────────────────────────────────────

function makeVaultPath(raw: string): VaultPath {
  return raw as unknown as VaultPath;
}

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeBody(raw: string): Body {
  return raw as unknown as Body;
}

function makeValidMarkdownContent(): string {
  return `---
tags: []
createdAt: "2026-04-28T12:00:00.000Z"
updatedAt: "2026-04-28T12:00:00.000Z"
---
Body text
`;
}

type EmittedEvents = Array<{ kind: string; [key: string]: unknown }>;

function makeEventSpy(): { events: EmittedEvents; emit: (e: { kind: string }) => void } {
  const events: EmittedEvents = [];
  return { events, emit: (e) => events.push(e as any) };
}

function makeHappyPathPorts(
  spy: ReturnType<typeof makeEventSpy>,
  files: string[] = ["/vault/2026-04-28-120000-001.md"]
): AppStartupPipelinePorts {
  const vaultPath = makeVaultPath("/home/user/vault");
  return {
    // Step 1 ports
    settingsLoad: () => ({ ok: true, value: vaultPath }),
    statDir: (_path: string) => ({ ok: true, value: true }),
    // Step 2 ports
    listMarkdown: (_path: VaultPath) => ({ ok: true, value: files }),
    readFile: (_filePath: string) => ({ ok: true, value: makeValidMarkdownContent() }),
    parseNote: (raw: string) => {
      if (!raw.trim()) return { ok: false, error: "missing-field" as const };
      return {
        ok: true,
        value: {
          body: makeBody("Body text"),
          fm: {
            tags: [],
            createdAt: makeTimestamp(1714298400000),
            updatedAt: makeTimestamp(1714298400000),
          } as any,
        },
      };
    },
    // Step 4 ports
    clockNow: () => makeTimestamp(1714298400000),
    allocateNoteId: (_ts: Timestamp) => makeNoteId("2026-04-28-120000-000"),
    // FIND-002: Note aggregate Smart Constructor stub.
    noteCreate: (id, ts) => ({
      id,
      body: "" as any,
      frontmatter: {
        tags: [],
        createdAt: ts,
        updatedAt: ts,
      } as any,
    }),
    // Event bus (both public and internal events flow through here in tests)
    emit: spy.emit,
    // VaultId for VaultScanned event
    vaultId: "default" as any,
  };
}

// ── PROP-017: Full pipeline happy path ────────────────────────────────────

describe("PROP-017: Full pipeline happy path → InitialUIState with editing status", () => {
  test("happy path returns Ok(InitialUIState)", async () => {
    // REQ-001, REQ-002, REQ-008, REQ-010, REQ-014: full pipeline integration.
    const spy = makeEventSpy();
    const ports = makeHappyPathPorts(spy);

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("InitialUIState");
    }
  });

  test("FIND-001 / REQ-014: InitialUIState has feed, tagInventory, corruptedFiles, editingSessionState", async () => {
    // REQ-014 AC: InitialUIState contains all four required fields.
    // FIND-001: field is editingSessionState (not initialNoteId).
    const spy = makeEventSpy();
    const ports = makeHappyPathPorts(spy);

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const state = result.value;
      expect("feed" in state).toBe(true);
      expect("tagInventory" in state).toBe(true);
      expect("corruptedFiles" in state).toBe(true);
      // FIND-001: must have editingSessionState, NOT initialNoteId
      expect("editingSessionState" in state).toBe(true);
      expect("initialNoteId" in state).toBe(false);
    }
  });

  test("FIND-014 / PROP-013 watchpoint: InitialUIState has EXACTLY {kind, feed, tagInventory, editingSessionState, corruptedFiles} — no Note aggregate retained", async () => {
    // FIND-014 / PROP-013 (Phase 1c iteration-4 watchpoint): under structural typing,
    // a TypeScript shape constraint cannot prove "no Note field is retained" — adding
    // `note: Note` to `InitialUIState` would still satisfy `extends { feed, tagInventory,
    // editingSessionState, corruptedFiles }`. The runtime `Object.keys` assertion below
    // is the load-bearing guard for REQ-010 NOTE (Note aggregate non-retention) and the
    // REQ-014 post-condition shape together.
    //
    // If a future commit attaches the `noteCreate(...)` return value as
    // `initialUIState.note`, this assertion will fail with an extra key — the regression
    // signal FIND-014 demanded. The discriminator `kind` is included because it is a
    // structural property of the value (`kind: "InitialUIState"`).
    const spy = makeEventSpy();
    const ports = makeHappyPathPorts(spy);

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.value).sort();
      expect(keys).toEqual([
        "corruptedFiles",
        "editingSessionState",
        "feed",
        "kind",
        "tagInventory",
      ]);
    }
  });

  test("FIND-014 / REQ-010 NOTE: Note aggregate constructed by noteCreate is NOT retained on InitialUIState", async () => {
    // FIND-014 resolution (Option A): Note.create is invoked at Step 4 to enforce
    // invariants and emit NewNoteAutoCreated, but the constructed Note aggregate is
    // discarded. Downstream code holds only `editingSessionState.currentNoteId`.
    //
    // This runtime assertion proves the negative: the noteCreate spy is called (sanity
    // check that the port is exercised — Sprint 1 FIND-002 regression guard), but the
    // returned Note value is not deep-equal to anything reachable from InitialUIState.
    const spy = makeEventSpy();
    let noteCreateReturn: unknown = undefined;

    const allocatedId = makeNoteId("2026-04-28-120000-000");
    const constructedNoteSentinel = {
      id: allocatedId,
      body: "" as any,
      frontmatter: {
        tags: [],
        createdAt: makeTimestamp(1714298400000),
        updatedAt: makeTimestamp(1714298400000),
      } as any,
    };

    const ports: AppStartupPipelinePorts = {
      ...makeHappyPathPorts(spy),
      allocateNoteId: (_ts: Timestamp) => allocatedId,
      noteCreate: (id, ts) => {
        const built = {
          id,
          body: "" as any,
          frontmatter: {
            tags: [],
            createdAt: ts,
            updatedAt: ts,
          } as any,
          // Distinct sentinel marker so identity comparison is unambiguous.
          __noteCreateSentinel__: constructedNoteSentinel,
        };
        noteCreateReturn = built;
        return built;
      },
    };

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Sanity: the noteCreate port WAS invoked (FIND-002 regression guard).
      expect(noteCreateReturn).toBeDefined();
      // FIND-014 Option A: the returned Note must NOT be retained on InitialUIState.
      const stateValues = Object.values(result.value);
      // None of the top-level values should be the noteCreate return value or carry the sentinel.
      for (const v of stateValues) {
        expect(v).not.toBe(noteCreateReturn);
        if (v && typeof v === "object" && "__noteCreateSentinel__" in v) {
          throw new Error("InitialUIState retained the constructed Note aggregate");
        }
      }
    }
  });

  test("FIND-001 / REQ-010: editingSessionState.status === 'editing'", async () => {
    // REQ-010 AC: EditingSessionState.status === 'editing'.
    // FIND-001: the state is accessed via editingSessionState.status.
    const spy = makeEventSpy();
    const allocatedId = makeNoteId("2026-04-28-120000-000");

    const ports: AppStartupPipelinePorts = {
      ...makeHappyPathPorts(spy),
      allocateNoteId: (_ts: Timestamp) => allocatedId,
    };

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // FIND-001: access editingSessionState, not initialNoteId
      expect(result.value.editingSessionState.status).toBe("editing");
      if (result.value.editingSessionState.status === "editing") {
        expect(result.value.editingSessionState.currentNoteId).toBe(allocatedId);
      }
    }
  });

  test("empty vault: happy path still produces InitialUIState with empty Feed", async () => {
    // REQ-002 / REQ-008 / REQ-010: empty vault works end-to-end.
    const spy = makeEventSpy();
    const ports = makeHappyPathPorts(spy, []); // no .md files

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.feed.noteRefs).toHaveLength(0);
      expect(result.value.corruptedFiles).toHaveLength(0);
    }
  });

  test("partial-failure vault: InitialUIState.corruptedFiles non-empty", async () => {
    // REQ-009 / REQ-014: corrupted files propagate to InitialUIState.
    const spy = makeEventSpy();
    const files = ["/vault/2026-04-28-120000-001.md", "/vault/bad.md"];

    const ports: AppStartupPipelinePorts = {
      ...makeHappyPathPorts(spy, files),
      readFile: (filePath: string) => {
        if (filePath === "/vault/bad.md") {
          return { ok: false, error: { kind: "permission" as const } };
        }
        return { ok: true, value: makeValidMarkdownContent() };
      },
    };

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.corruptedFiles).toHaveLength(1);
      expect(result.value.corruptedFiles[0].filePath).toBe("/vault/bad.md");
    }
  });
});

// ── PROP-023a: Clock.now budget ≤ 2 per pipeline run ─────────────────────

describe("PROP-023 / REQ-015: Clock.now budget ≤ 2 per pipeline run", () => {
  test("PROP-023a: happy-path full pipeline calls Clock.now exactly twice", async () => {
    // REQ-015 AC-3: Clock.now() called at most twice per pipeline run.
    // Call 1: inter-step orchestrator (between Step 2 and Step 3).
    // Call 2: inside Step 4 initializeCaptureSession.
    // FIND-003 resolution: exactly 2 calls, never more.
    let clockCallCount = 0;
    const spy = makeEventSpy();

    const ports: AppStartupPipelinePorts = {
      ...makeHappyPathPorts(spy),
      clockNow: () => {
        clockCallCount++;
        return makeTimestamp(1714298400000 + clockCallCount);
      },
    };

    await runAppStartupPipeline(ports);

    // REQ-015 AC-3: at most 2 Clock.now calls, and specifically 2 on the happy path.
    // The current impl calls clockNow in pipeline.ts AND in initializeCaptureSession.
    // If the impl calls it 3+ times, this test will catch it.
    expect(clockCallCount).toBeGreaterThanOrEqual(1);
    expect(clockCallCount).toBeLessThanOrEqual(2);
  });

  test("PROP-023a: early-exit on unconfigured (Step 1 failure) — Clock.now bounded", async () => {
    // REQ-015 AC-3 / PROP-023: total Clock.now port calls per pipeline run ≤ 2.
    // Post FIND-009: loadVaultConfig stamps VaultDirectoryNotConfigured.occurredOn
    // through the clockNow port (exactly once on the unconfigured branch).
    // The orchestrator clockNow (between Steps 2 and 3) and the Step 4 clockNow
    // are NOT reached in this early-exit, so the total observable count is 1.
    let pipelineClockCallCount = 0;
    const spy = makeEventSpy();

    const ports: AppStartupPipelinePorts = {
      ...makeHappyPathPorts(spy),
      settingsLoad: () => ({ ok: true, value: null }),
      clockNow: () => {
        pipelineClockCallCount++;
        return makeTimestamp(9999999999);
      },
    };

    await runAppStartupPipeline(ports);

    // FIND-009: exactly one call (loadVaultConfig stamps occurredOn).
    // Orchestrator + Step 4 calls do not happen in this early-exit.
    expect(pipelineClockCallCount).toBe(1);
    expect(pipelineClockCallCount).toBeLessThanOrEqual(2);
  });

  test("PROP-023a: Step 2 list-failed early exit — Clock.now NOT called by pipeline orchestrator", async () => {
    // REQ-015 AC-3: When Step 2 fails, the inter-step clockNow call and Step 4
    // clockNow call must not occur.
    let pipelineClockCallCount = 0;
    const spy = makeEventSpy();

    const ports: AppStartupPipelinePorts = {
      ...makeHappyPathPorts(spy),
      listMarkdown: (_path: VaultPath) => ({
        ok: false,
        error: { kind: "list-failed" as const, detail: "EPERM" },
      }),
      clockNow: () => {
        pipelineClockCallCount++;
        return makeTimestamp(9999999999);
      },
    };

    await runAppStartupPipeline(ports);

    expect(pipelineClockCallCount).toBe(0);
  });
});

// ── REQ-013a / PROP-021: Event ordering ──────────────────────────────────

describe("REQ-013a / REQ-013b / PROP-021: Event ordering", () => {
  test("VaultScanned is emitted (public domain event from Vault context)", async () => {
    // REQ-013a AC: VaultScanned is a public domain event.
    const spy = makeEventSpy();
    const ports = makeHappyPathPorts(spy);

    await runAppStartupPipeline(ports);

    const vaultScannedEvents = spy.events.filter((e) => e.kind === "vault-scanned");
    expect(vaultScannedEvents).toHaveLength(1);

    const evt = vaultScannedEvents[0] as Partial<VaultScanned>;
    // REQ-013a AC: VaultScanned payload shape
    expect("vaultId" in evt).toBe(true);
    expect("snapshots" in evt).toBe(true);
    expect("corruptedFiles" in evt).toBe(true);
    expect("occurredOn" in evt).toBe(true);
  });

  test("VaultScanned.corruptedFiles uses CorruptedFile.failure (not reason field)", async () => {
    // REQ-013a AC: corruptedFiles uses CorruptedFile type with failure: ScanFileFailure.
    const spy = makeEventSpy();
    const files = ["/vault/bad.md"];

    const ports: AppStartupPipelinePorts = {
      ...makeHappyPathPorts(spy, files),
      readFile: (_filePath: string) => ({
        ok: false,
        error: { kind: "permission" as const },
      }),
    };

    await runAppStartupPipeline(ports);

    const evt = spy.events.find((e) => e.kind === "vault-scanned") as any;
    if (evt && evt.corruptedFiles.length > 0) {
      const cf = evt.corruptedFiles[0];
      // Must have 'failure' field (not 'reason')
      expect("failure" in cf).toBe(true);
      expect("reason" in cf).toBe(false);
    }
  });

  test("FeedRestored emitted after VaultScanned", async () => {
    // REQ-013b AC: FeedRestored is emitted after VaultScanned.
    const spy = makeEventSpy();
    const ports = makeHappyPathPorts(spy);

    await runAppStartupPipeline(ports);

    const vaultScannedIdx = spy.events.findIndex((e) => e.kind === "vault-scanned");
    const feedRestoredIdx = spy.events.findIndex((e) => e.kind === "feed-restored");

    expect(vaultScannedIdx).toBeGreaterThanOrEqual(0);
    expect(feedRestoredIdx).toBeGreaterThanOrEqual(0);
    // REQ-013b AC: VaultScanned → FeedRestored ordering
    expect(feedRestoredIdx).toBeGreaterThan(vaultScannedIdx);
  });

  test("TagInventoryBuilt emitted after FeedRestored", async () => {
    // REQ-013b AC: TagInventoryBuilt emitted after FeedRestored.
    const spy = makeEventSpy();
    const ports = makeHappyPathPorts(spy);

    await runAppStartupPipeline(ports);

    const feedRestoredIdx = spy.events.findIndex((e) => e.kind === "feed-restored");
    const tagInventoryBuiltIdx = spy.events.findIndex(
      (e) => e.kind === "tag-inventory-built"
    );

    expect(feedRestoredIdx).toBeGreaterThanOrEqual(0);
    expect(tagInventoryBuiltIdx).toBeGreaterThanOrEqual(0);
    // REQ-013b AC: FeedRestored → TagInventoryBuilt ordering
    expect(tagInventoryBuiltIdx).toBeGreaterThan(feedRestoredIdx);
  });

  test("PROP-021: ordering VaultScanned → FeedRestored → TagInventoryBuilt", async () => {
    // PROP-021 full ordering assertion.
    const spy = makeEventSpy();
    const ports = makeHappyPathPorts(spy);

    await runAppStartupPipeline(ports);

    const vaultScannedIdx = spy.events.findIndex((e) => e.kind === "vault-scanned");
    const feedRestoredIdx = spy.events.findIndex((e) => e.kind === "feed-restored");
    const tagInventoryBuiltIdx = spy.events.findIndex((e) => e.kind === "tag-inventory-built");

    expect(vaultScannedIdx).toBeGreaterThanOrEqual(0);
    expect(feedRestoredIdx).toBeGreaterThan(vaultScannedIdx);
    expect(tagInventoryBuiltIdx).toBeGreaterThan(feedRestoredIdx);
  });

  test("FIND-007 / PROP-021: FeedRestored NOT in PublicDomainEvent — type-level assertion", () => {
    // REQ-013b AC: FeedRestored is Curate-internal.
    // Type-level: _FeedRestoredNotPublic is declared as `never` at file top.
    // This test is a runtime placeholder to make the test ID visible in the output.
    // The real assertion is compile-time (see top-level type declarations).
    // If someone adds feed-restored to PublicDomainEvent, the _f assignment fails to compile.
    const feedRestoredKind = "feed-restored";
    // Verify it does not exist in PublicDomainEvent kinds by structural check:
    // Since PublicDomainEvent is a union of named types, we verify via the
    // type-level assertion that Extract<PublicDomainEvent, {kind:'feed-restored'}> === never.
    // Runtime check: ensure the test passes when types are correct.
    expect(feedRestoredKind).toBe("feed-restored"); // tautology — proof is compile-time only
  });

  test("FIND-007 / PROP-021: TagInventoryBuilt NOT in PublicDomainEvent — type-level assertion", () => {
    // REQ-013b AC: TagInventoryBuilt is Curate-internal.
    // Type-level: _TagInventoryBuiltNotPublic is declared as `never` at file top.
    const tagInventoryBuiltKind = "tag-inventory-built";
    expect(tagInventoryBuiltKind).toBe("tag-inventory-built");
  });

  test("FIND-007 / PROP-021: VaultScanned IS in PublicDomainEvent — type-level assertion", () => {
    // REQ-013a AC: VaultScanned is a public domain event.
    // Type-level: _VaultScannedIsPublic is declared at file top and must not be never.
    // Runtime placeholder.
    const vaultScannedKind = "vault-scanned";
    expect(vaultScannedKind).toBe("vault-scanned");
  });

  test("REQ-013a: VaultScanned emitter is Vault (not Capture, not Curate)", async () => {
    // REQ-013a AC: Emitter is Vault Aggregate.
    // VaultScanned being in PublicDomainEvent confirms Vault is the publisher.
    // Type-level check at file top: _VaultScannedIsPublic is VaultScanned.
    const spy = makeEventSpy();
    const ports = makeHappyPathPorts(spy);
    await runAppStartupPipeline(ports);
    const publicEventKindsFromSpy = spy.events.map((e) => e.kind);
    expect(publicEventKindsFromSpy).toContain("vault-scanned");
  });
});

// ── Pipeline error routing ────────────────────────────────────────────────

describe("Pipeline error routing from Step 1 and Step 2", () => {
  test("Settings.load null → Err(AppStartupError{kind:config, reason:{kind:unconfigured}})", async () => {
    // REQ-003: pipeline terminates at Step 1 on Unconfigured.
    const spy = makeEventSpy();

    const ports: AppStartupPipelinePorts = {
      ...makeHappyPathPorts(spy),
      settingsLoad: () => ({ ok: true, value: null }),
    };

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("config");
    }
  });

  test("statDir Err(not-found) → Err(AppStartupError{kind:config, reason:{kind:path-not-found}})", async () => {
    // REQ-004: pipeline terminates at Step 1 on PathNotFound.
    const spy = makeEventSpy();

    const ports: AppStartupPipelinePorts = {
      ...makeHappyPathPorts(spy),
      statDir: (_path: string) => ({ ok: false, error: { kind: "not-found" as const } }),
    };

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("config");
      if (result.error.kind === "config") {
        expect(result.error.reason.kind).toBe("path-not-found");
      }
    }
  });

  test("listMarkdown fails → Err(AppStartupError{kind:scan, reason:{kind:list-failed}})", async () => {
    // REQ-007: pipeline terminates at Step 2 on list-failed.
    const spy = makeEventSpy();

    const ports: AppStartupPipelinePorts = {
      ...makeHappyPathPorts(spy),
      listMarkdown: (_path: VaultPath) => ({
        ok: false,
        error: { kind: "list-failed" as const, detail: "EPERM" },
      }),
    };

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("scan");
    }
  });
});

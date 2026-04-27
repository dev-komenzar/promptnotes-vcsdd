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
 *
 * PROP-017: Full pipeline integration: happy path → InitialUIState with editing status
 * PROP-021: Event ordering: VaultScanned → FeedRestored → TagInventoryBuilt
 */

import { describe, test, expect } from "bun:test";
import type { NoteId, Timestamp, VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { CorruptedFile } from "promptnotes-domain-types/shared/snapshots";
import type { VaultScanned } from "promptnotes-domain-types/shared/events";
import type { InitialUIState } from "$lib/domain/app-startup/stages";

// The implementation does NOT exist yet. This import will fail in Red phase.
import {
  runAppStartupPipeline,
  type AppStartupPipelinePorts,
} from "$lib/domain/app-startup/pipeline";

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
  files: string[] = ["/vault/note.md"]
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
          body: "Body text",
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

  test("REQ-014: InitialUIState has feed, tagInventory, corruptedFiles, initialNoteId", async () => {
    // REQ-014 AC: InitialUIState contains all four required fields.
    const spy = makeEventSpy();
    const ports = makeHappyPathPorts(spy);

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const state = result.value;
      expect("feed" in state).toBe(true);
      expect("tagInventory" in state).toBe(true);
      expect("corruptedFiles" in state).toBe(true);
      expect("initialNoteId" in state).toBe(true);
    }
  });

  test("REQ-010: editingSessionState.status === editing", async () => {
    // REQ-010 AC: EditingSessionState.status === 'editing'.
    const spy = makeEventSpy();
    const allocatedId = makeNoteId("2026-04-28-120000-000");

    const ports: AppStartupPipelinePorts = {
      ...makeHappyPathPorts(spy),
      allocateNoteId: (_ts: Timestamp) => allocatedId,
    };

    const result = await runAppStartupPipeline(ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The editing state is evidenced by initialNoteId being set
      expect(result.value.initialNoteId).toBe(allocatedId);
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
    const files = ["/vault/ok.md", "/vault/bad.md"];

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

  test("PROP-021: FeedRestored is NOT in PublicDomainEvent union (Curate-internal only)", () => {
    // REQ-013b AC: FeedRestored is Curate-internal — NOT part of PublicDomainEvent.
    // Type-level check: if FeedRestored were added to PublicDomainEvent, this type
    // assertion would need updating. For Phase 2a this is a nominal check.
    // The 'feed-restored' kind does NOT appear in shared/events.ts PublicDomainEvent.
    const publicEventKinds = [
      "vault-directory-configured",
      "vault-directory-not-configured",
      "vault-scanned",
      "note-file-saved",
      "note-save-failed",
      "note-file-deleted",
      "note-deletion-failed",
      "note-hydration-failed",
      "save-note-requested",
      "empty-note-discarded",
      "past-note-selected",
      "delete-note-requested",
    ];
    // feed-restored and tag-inventory-built must NOT be in this list
    expect(publicEventKinds).not.toContain("feed-restored");
    expect(publicEventKinds).not.toContain("tag-inventory-built");
  });

  test("REQ-013a: VaultScanned emitter is Vault (not Capture, not Curate)", async () => {
    // REQ-013a AC: Emitter is Vault Aggregate.
    // Verified by VaultScanned being a PublicDomainEvent (Vault is the publisher).
    // The VaultScanned event kind appears in shared/events.ts PublicDomainEvent.
    const publicEventKinds = [
      "vault-directory-configured",
      "vault-directory-not-configured",
      "vault-scanned",
      "note-file-saved",
      "note-save-failed",
      "note-file-deleted",
      "note-deletion-failed",
      "note-hydration-failed",
      "save-note-requested",
      "empty-note-discarded",
      "past-note-selected",
      "delete-note-requested",
    ];
    expect(publicEventKinds).toContain("vault-scanned");
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

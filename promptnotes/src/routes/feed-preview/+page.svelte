<script lang="ts">
  import FeedList from "$lib/feed/FeedList.svelte";
  import type { TauriFeedAdapter } from "$lib/feed/tauriFeedAdapter";
  import type { FeedStateChannel } from "$lib/feed/feedStateChannel";
  import type {
    FeedViewState,
    FeedDomainSnapshot,
    NoteRowMetadata,
  } from "$lib/feed/types";

  // Dev-only preview route: mocks the IPC layer so the FeedList mounts
  // without the Tauri backend. This page exists for visual verification
  // (Phase 6 UI mount audit). Mirrors the editor-preview pattern.

  let log = $state<string[]>([]);

  function pushLog(msg: string) {
    log = [...log, msg].slice(-30);
  }

  const adapter: TauriFeedAdapter = {
    dispatchSelectPastNote: async (p) => {
      pushLog(`select_past_note ${JSON.stringify(p)}`);
    },
    dispatchRequestNoteDeletion: async (p) => {
      pushLog(`request_note_deletion ${JSON.stringify(p)}`);
    },
    dispatchConfirmNoteDeletion: async (p) => {
      pushLog(`confirm_note_deletion ${JSON.stringify(p)}`);
    },
    dispatchCancelNoteDeletion: async (p) => {
      pushLog(`cancel_note_deletion ${JSON.stringify(p)}`);
    },
  };

  // Snapshot subscriber that the channel will replay into the reducer.
  let snapshotHandlers: Array<(snapshot: FeedDomainSnapshot) => void> = [];

  const stateChannel: FeedStateChannel = {
    subscribe: (handler) => {
      snapshotHandlers.push(handler);
      return () => {
        snapshotHandlers = snapshotHandlers.filter((h) => h !== handler);
      };
    },
  };

  function publishSnapshot(snapshot: FeedDomainSnapshot) {
    for (const h of snapshotHandlers) h(snapshot);
  }

  // Sample metadata for 3 mock notes (mirroring the spec test fixtures).
  const sampleMetadata: Record<string, NoteRowMetadata> = {
    "note-001": {
      body: "ProductHunt のリサーチ\n投稿者の反応を確認する",
      createdAt: 1735689600000, // 2025-01-01 00:00 JST
      updatedAt: 1735776000000, // 2025-01-02 00:00 JST
      tags: ["research", "ph"],
    },
    "note-002": {
      body: "TODO: Tauri 2 のサンドボックス挙動を検証\n再現コードを作る",
      createdAt: 1735862400000,
      updatedAt: 1736035200000,
      tags: ["tauri", "todo"],
    },
    "note-003": {
      body: "短いメモ",
      createdAt: 1736121600000,
      updatedAt: 1736121600000,
      tags: [],
    },
  };

  const initialState: FeedViewState & { filterApplied: boolean } = {
    editingStatus: "idle",
    editingNoteId: null,
    pendingNextFocus: null,
    visibleNoteIds: ["note-001", "note-002", "note-003"],
    allNoteIds: ["note-001", "note-002", "note-003"],
    loadingStatus: "ready",
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: sampleMetadata,
    tagAutocompleteVisibleFor: null,
    activeFilterTags: [],
    searchQuery: "",
    sortDirection: "desc",
    filterApplied: false,
  };

  // Helper buttons to simulate domain events (so reviewer can poke states).
  function simulateLoadingStart() {
    publishSnapshot({
      editing: { status: "idle", currentNoteId: null, pendingNextFocus: null },
      feed: { visibleNoteIds: [], filterApplied: false },
      delete: { activeDeleteModalNoteId: null, lastDeletionError: null },
      noteMetadata: {},
      cause: { kind: "InitialLoad" },
    });
    pushLog("simulate: loading start (visible=0, status=idle)");
  }

  function simulateRefilledFeed() {
    publishSnapshot({
      editing: { status: "idle", currentNoteId: null, pendingNextFocus: null },
      feed: { visibleNoteIds: ["note-001", "note-002", "note-003"], filterApplied: false },
      delete: { activeDeleteModalNoteId: null, lastDeletionError: null },
      noteMetadata: sampleMetadata,
      cause: { kind: "InitialLoad" },
    });
    pushLog("simulate: feed re-filled (3 notes)");
  }

  function simulateFilteredEmpty() {
    publishSnapshot({
      editing: { status: "idle", currentNoteId: null, pendingNextFocus: null },
      feed: { visibleNoteIds: [], filterApplied: true },
      delete: { activeDeleteModalNoteId: null, lastDeletionError: null },
      noteMetadata: {},
      cause: { kind: "InitialLoad" },
    });
    pushLog("simulate: filtered empty");
  }

  function simulateEditingNote001() {
    publishSnapshot({
      editing: { status: "editing", currentNoteId: "note-001", pendingNextFocus: null },
      feed: { visibleNoteIds: ["note-001", "note-002", "note-003"], filterApplied: false },
      delete: { activeDeleteModalNoteId: null, lastDeletionError: null },
      noteMetadata: sampleMetadata,
      cause: { kind: "EditingStateChanged" },
    });
    pushLog("simulate: editing note-001 (delete button should be disabled on row 1)");
  }

  function simulatePendingSwitch() {
    publishSnapshot({
      editing: { status: "switching", currentNoteId: "note-001", pendingNextFocus: { noteId: "note-002", blockId: "" } },
      feed: { visibleNoteIds: ["note-001", "note-002", "note-003"], filterApplied: false },
      delete: { activeDeleteModalNoteId: null, lastDeletionError: null },
      noteMetadata: sampleMetadata,
      cause: { kind: "EditingStateChanged" },
    });
    pushLog("simulate: switching to note-002 (pending-switch indicator should appear on row 2)");
  }

  function simulateDeletionPermissionError() {
    publishSnapshot({
      editing: { status: "idle", currentNoteId: null, pendingNextFocus: null },
      feed: { visibleNoteIds: ["note-001", "note-002", "note-003"], filterApplied: false },
      delete: {
        activeDeleteModalNoteId: null,
        lastDeletionError: { reason: "permission" },
      },
      noteMetadata: sampleMetadata,
      cause: { kind: "NoteDeletionFailed", failedNoteId: "note-002" },
    });
    pushLog("simulate: deletion failed (permission) — banner should appear at top");
  }
</script>

<main class="preview">
  <h1>FeedList preview (dev only)</h1>
  <p>
    Phase 6 UI-mount verification harness. Mocks the IPC layer so the
    <code>FeedList</code> + <code>FeedRow</code> + <code>DeleteConfirmModal</code>
    + <code>DeletionFailureBanner</code> mount without the Tauri backend.
  </p>

  <div class="controls">
    <button onclick={simulateRefilledFeed}>Refill feed (3 notes)</button>
    <button onclick={simulateLoadingStart}>Show loading state</button>
    <button onclick={simulateFilteredEmpty}>Filtered empty state</button>
    <button onclick={simulateEditingNote001}>Editing note-001 (disable row 1 delete)</button>
    <button onclick={simulatePendingSwitch}>Pending switch → note-002</button>
    <button onclick={simulateDeletionPermissionError}>Show deletion failure banner</button>
  </div>

  <section class="feed-host" data-testid="preview-feed-host">
    <FeedList viewState={initialState} {adapter} {stateChannel} />
  </section>

  <details>
    <summary>IPC dispatch log (last 30)</summary>
    <pre data-testid="preview-log">{log.join("\n")}</pre>
  </details>
</main>

<style>
  .preview {
    padding: 24px;
    max-width: 720px;
    margin: 0 auto;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  }

  h1 {
    font-size: 22px;
    font-weight: 600;
    color: #1f1f1f;
    margin-bottom: 8px;
  }

  p {
    color: #6b6b6b;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 24px;
    padding: 12px;
    background: #f7f7f5;
    border-radius: 8px;
  }

  .controls button {
    padding: 6px 12px;
    background: #ffffff;
    border: 1px solid #e9e9e7;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }

  .controls button:hover {
    background: #f0f0ee;
  }

  .feed-host {
    background: #ffffff;
    border: 1px solid #e9e9e7;
    border-radius: 8px;
    padding: 12px;
  }

  details {
    margin-top: 24px;
    background: #f7f7f5;
    border-radius: 8px;
    padding: 12px;
  }

  summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
  }

  pre {
    margin-top: 8px;
    font-family: ui-monospace, SF Mono, Menlo, monospace;
    font-size: 12px;
    color: #333;
    white-space: pre-wrap;
    max-height: 240px;
    overflow-y: auto;
  }

  code {
    font-family: ui-monospace, SF Mono, Menlo, monospace;
    font-size: 12px;
    background: #f0f0ee;
    padding: 2px 4px;
    border-radius: 3px;
  }
</style>

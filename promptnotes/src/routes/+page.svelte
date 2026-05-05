<script lang="ts">
  /**
   * +page.svelte — Main route.
   *
   * Sprint 2 (REQ-FEED-023): Two-column layout inside AppShell.
   *   - Left sidebar (.feed-sidebar, 320px): FeedList
   *   - Central pane (.editor-main, 1fr): EditorPane
   *
   * DESIGN.md compliance:
   *   - Sidebar border: #e9e9e7 (whisper border)
   *   - Sidebar background: #f7f7f5 (warm neutral surface)
   *   - Layout: CSS Grid 320px 1fr, height 100vh
   */

  import AppShell from "$lib/ui/app-shell/AppShell.svelte";
  import EditorPane from "$lib/editor/EditorPane.svelte";
  import FeedList from "$lib/feed/FeedList.svelte";
  import { createTauriEditorAdapter } from "$lib/editor/tauriEditorAdapter.js";
  import { createEditorStateChannel } from "$lib/editor/editorStateChannel.js";
  import { createDebounceTimer } from "$lib/editor/debounceTimer.js";
  import { createClipboardAdapter } from "$lib/editor/clipboardAdapter.js";
  import { createTauriFeedAdapter } from "$lib/feed/tauriFeedAdapter.js";
  import { createFeedStateChannel } from "$lib/feed/feedStateChannel.js";
  import type { FeedViewState } from "$lib/feed/types.js";
  import { invoke } from "@tauri-apps/api/core";

  // ── Editor adapters (Sprint 1, ui-editor feature) ────────────────────────
  const clock = { now: () => Date.now() };
  const adapter = createTauriEditorAdapter();
  const stateChannel = createEditorStateChannel();
  const timer = createDebounceTimer(clock);
  const clipboard = createClipboardAdapter();

  // ── Feed adapters (Sprint 2, ui-feed-list-actions feature) ──────────────
  const feedAdapter = createTauriFeedAdapter();
  const feedStateChannel = createFeedStateChannel();

  // Initial feed view state — loading until feed_initial_state resolves.
  let feedViewState = $state<FeedViewState>({
    editingStatus: "idle",
    editingNoteId: null,
    pendingNextNoteId: null,
    visibleNoteIds: [],
    loadingStatus: "loading",
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: {},
    tagAutocompleteVisibleFor: null,
    activeFilterTags: [],
  });

  // FIND-S2-01/05/06: Current vault path, resolved once on mount and passed to
  // FeedList so it can forward it to Rust commands that need to emit feed snapshots.
  let currentVaultPath = $state<string>('');

  // REQ-FEED-022: Load initial state from Rust after mount.
  // We use $effect to trigger after the component is attached to the DOM.
  $effect(() => {
    (async () => {
      try {
        // settings_load provides the vault path (configured by ui-app-shell).
        const vaultPath = await invoke<string | null>("settings_load");
        if (vaultPath) {
          currentVaultPath = vaultPath;
          const snapshot = await invoke<{
            editing: { status: string; currentNoteId: string | null; pendingNextNoteId: string | null };
            feed: { visibleNoteIds: string[]; filterApplied: boolean };
            delete: { activeDeleteModalNoteId: string | null; lastDeletionError: null };
            noteMetadata: Record<string, { body: string; createdAt: number; updatedAt: number; tags: string[] }>;
            cause: { kind: string };
          }>("feed_initial_state", { vaultPath });

          feedViewState = {
            editingStatus: (snapshot.editing.status as FeedViewState["editingStatus"]) ?? "idle",
            editingNoteId: snapshot.editing.currentNoteId,
            pendingNextNoteId: snapshot.editing.pendingNextNoteId,
            visibleNoteIds: snapshot.feed.visibleNoteIds,
            loadingStatus: "ready",
            activeDeleteModalNoteId: snapshot.delete.activeDeleteModalNoteId,
            lastDeletionError: null,
            noteMetadata: snapshot.noteMetadata,
            tagAutocompleteVisibleFor: feedViewState.tagAutocompleteVisibleFor,
            activeFilterTags: feedViewState.activeFilterTags,
          };
        } else {
          // Unconfigured: show empty feed as ready (AppShell will redirect to modal)
          feedViewState = { ...feedViewState, loadingStatus: "ready" };
        }
      } catch {
        // If feed_initial_state fails (e.g., vault not yet configured), show ready empty state
        feedViewState = { ...feedViewState, loadingStatus: "ready" };
      }
    })();
  });
</script>

<AppShell>
  <!-- REQ-FEED-023: Two-column layout — sidebar (FeedList) + central pane (EditorPane) -->
  <div class="layout">
    <aside class="feed-sidebar">
      <FeedList
        viewState={feedViewState}
        adapter={feedAdapter}
        stateChannel={feedStateChannel}
        vaultPath={currentVaultPath}
      />
    </aside>
    <div class="editor-main">
      <EditorPane
        {adapter}
        {stateChannel}
        {timer}
        {clipboard}
        {clock}
      />
    </div>
  </div>
</AppShell>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background-color: #ffffff;
    height: 100%;
  }

  :global(:root) {
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    font-weight: 400;
    color: #1f1f1f;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* REQ-FEED-023: Two-column grid layout. DESIGN.md: 320px sidebar + 1fr main. */
  .layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    height: 100vh;
    overflow: hidden;
  }

  /* REQ-FEED-023: Sidebar — DESIGN.md whisper border #e9e9e7, warm neutral #f7f7f5 */
  .feed-sidebar {
    border-right: 1px solid #e9e9e7;
    background: #f7f7f5;
    overflow-y: auto;
    height: 100%;
  }

  .editor-main {
    overflow-y: auto;
    height: 100%;
  }
</style>

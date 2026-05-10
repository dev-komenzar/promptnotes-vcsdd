<script lang="ts">
  /**
   * FeedRowSprint6PropertyWrapper.svelte — Test-only wrapper for Sprint 6
   * property tests.
   *
   * Exposes reactive state setters via window.__feedRowSprint6Test__<id> so
   * fast-check property tests can mutate props per-run and observe DOM.
   *
   * NOT production code; mounted only in vitest+jsdom (PROP-FEED-S6-002).
   *
   * Modelled after FeedRowSprint5Wrapper.svelte (Sprint 5 reference).
   */
  import FeedRow from '../../../FeedRow.svelte';
  import type { TauriFeedAdapter } from '../../../tauriFeedAdapter.js';
  import type { BlockEditorAdapter } from '$lib/block-editor/types.js';
  import type { FeedViewState } from '../../../types.js';
  import type { EditingSessionStateDto } from '../../../editingSessionChannel.js';

  interface Props {
    instanceId: string;
    initialNoteId: string;
    initialBody: string;
    initialCreatedAt: number;
    initialUpdatedAt: number;
    initialTags: readonly string[];
    initialViewState: FeedViewState;
    initialEditingSessionState: EditingSessionStateDto | null;
    feedAdapter: TauriFeedAdapter;
    blockAdapter: BlockEditorAdapter | null;
  }

  const {
    instanceId,
    initialNoteId,
    initialBody,
    initialCreatedAt,
    initialUpdatedAt,
    initialTags,
    initialViewState,
    initialEditingSessionState,
    feedAdapter,
    blockAdapter: initialBlockAdapter,
  }: Props = $props();

  let viewState = $state<FeedViewState>(initialViewState);
  let editingSessionState = $state<EditingSessionStateDto | null>(initialEditingSessionState);
  let blockAdapter = $state<BlockEditorAdapter | null>(initialBlockAdapter);

  /** Test-only setters callable from fast-check test runners. */
  export function setViewState(next: FeedViewState): void {
    viewState = next;
  }

  export function setEditingSessionState(next: EditingSessionStateDto | null): void {
    editingSessionState = next;
  }

  export function setBlockAdapter(next: BlockEditorAdapter | null): void {
    blockAdapter = next;
  }

  // Stash setters on a unique window key so the test can reach them without
  // touching Svelte component internals.  Key format:
  //   `__feedRowSprint6Test__<instanceId>`
  // where instanceId is supplied by the caller to allow multiple concurrent
  // wrapper instances (one per fast-check run).
  const setterKey = `__feedRowSprint6Test__${instanceId}`;

  $effect(() => {
    (window as unknown as Record<string, unknown>)[setterKey] = {
      setViewState,
      setEditingSessionState,
      setBlockAdapter,
    };
    return () => {
      delete (window as unknown as Record<string, unknown>)[setterKey];
    };
  });
</script>

<div data-testid="sprint-6-wrapper" data-setter-key={setterKey} data-instance-id={instanceId}>
  <FeedRow
    noteId={initialNoteId}
    body={initialBody}
    createdAt={initialCreatedAt}
    updatedAt={initialUpdatedAt}
    tags={initialTags}
    viewState={viewState}
    adapter={feedAdapter}
    tagInventory={[]}
    editingSessionState={editingSessionState}
    blockEditorAdapter={blockAdapter}
  />
</div>

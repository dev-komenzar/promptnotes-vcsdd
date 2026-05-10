<script lang="ts">
  /**
   * FeedRowSprint5Wrapper.svelte — Test-only wrapper that exposes reactive
   * `editingSessionState` and `viewState` props so DOM tests can mutate them
   * post-mount and observe FeedRow's $effect re-run (PROP-FEED-S5-011 (d)).
   *
   * Used by feed-row-empty-fallback.dom.vitest.ts to verify the
   * undefined→non-empty→undefined restart sequence.
   *
   * NOT production code; mounted only in vitest+jsdom.
   */
  import FeedRow from '../../FeedRow.svelte';
  import type { TauriFeedAdapter } from '../../tauriFeedAdapter.js';
  import type { BlockEditorAdapter } from '$lib/block-editor/types.js';
  import type { FeedViewState } from '../../types.js';
  import type { EditingSessionStateDto } from '../../editingSessionChannel.js';

  interface Props {
    initialNoteId: string;
    initialBody: string;
    initialCreatedAt: number;
    initialUpdatedAt: number;
    initialTags: readonly string[];
    initialViewState: FeedViewState;
    initialEditingSessionState: EditingSessionStateDto | null;
    feedAdapter: TauriFeedAdapter;
    blockAdapter: BlockEditorAdapter;
  }

  const {
    initialNoteId,
    initialBody,
    initialCreatedAt,
    initialUpdatedAt,
    initialTags,
    initialViewState,
    initialEditingSessionState,
    feedAdapter,
    blockAdapter,
  }: Props = $props();

  let viewState = $state<FeedViewState>(initialViewState);
  let editingSessionState = $state<EditingSessionStateDto | null>(initialEditingSessionState);

  /** Test-only: callable from outside via window-stashed reference. */
  export function setEditingSessionState(next: EditingSessionStateDto | null): void {
    editingSessionState = next;
  }

  export function setViewState(next: FeedViewState): void {
    viewState = next;
  }

  // Stash the wrapper's setters on a per-mount unique window key so the test
  // can grab them without touching component internals.
  const setterKey = `__feedRowSprint5Setter_${Math.random().toString(36).slice(2)}`;
  // Expose during $effect so the wrapper instance is fully constructed.
  $effect(() => {
    (window as unknown as Record<string, unknown>)[setterKey] = {
      setEditingSessionState,
      setViewState,
    };
    return () => {
      delete (window as unknown as Record<string, unknown>)[setterKey];
    };
  });
  // Surface the key as a data attribute so the test can read it.
</script>

<div data-testid="sprint-5-wrapper" data-setter-key={setterKey}>
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

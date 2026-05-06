<script lang="ts">
  /**
   * SortToggle.svelte — Sort direction toggle button (ui-filter-search)
   *
   * Effectful shell: DOM click → dispatches SortDirectionToggled to reducer.
   * Renders ▼ when sortDirection === 'desc' (newest first, default).
   * Renders ▲ when sortDirection === 'asc' (oldest first).
   *
   * Props:
   *   sortDirection — current sort direction from viewState
   *   onToggle()    — fired on click; parent dispatches SortDirectionToggled
   *
   * REQ-FILTER-006: data-testid="sort-toggle", ▼/▲ display, default desc
   * REQ-FILTER-007: click → onToggle() → reducer flips sortDirection
   * REQ-FILTER-013: aria-label="ソート方向（新しい順/古い順）" (static label)
   * REQ-FILTER-014: DESIGN.md Secondary button tokens
   */

  interface Props {
    sortDirection: 'asc' | 'desc';
    onToggle: () => void;
  }

  const { sortDirection, onToggle }: Props = $props();

  const icon = $derived(sortDirection === 'desc' ? '▼' : '▲');
</script>

<button
  data-testid="sort-toggle"
  type="button"
  aria-label="ソート方向（新しい順/古い順）"
  onclick={() => onToggle()}
  class="sort-toggle"
>
  {icon}
</button>

<style>
  .sort-toggle {
    /* DESIGN.md Secondary button style (REQ-FILTER-006, REQ-FILTER-014) */
    background: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.95);
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    font-size: 14px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .sort-toggle:hover {
    background: rgba(0, 0, 0, 0.08);
  }

  .sort-toggle:active {
    transform: scale(0.9);
  }

  .sort-toggle:focus-visible {
    /* DESIGN.md Focus Blue for focus ring (REQ-FILTER-013) */
    outline: 2px solid #097fe8;
    outline-offset: 2px;
  }
</style>

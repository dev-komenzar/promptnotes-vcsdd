<script lang="ts">
  /**
   * SearchInput.svelte — Search input with 200ms debounce (ui-filter-search)
   *
   * Effectful shell: holds pending input as local $state (never sent to reducer
   * until debounce fires). Manages debounce timer via setTimeout/clearTimeout.
   *
   * Props:
   *   onSearchApplied(query) — fired after SEARCH_DEBOUNCE_MS of silence
   *   onSearchCleared()      — fired immediately on Escape key
   *
   * REQ-FILTER-001: data-testid="search-input", placeholder "検索..."
   * REQ-FILTER-002: 200ms debounce; dispatches SearchApplied (not SearchInputChanged)
   * REQ-FILTER-003: Escape clears pending input and fires onSearchCleared immediately
   * REQ-FILTER-013: aria-label="ノート検索"
   * REQ-FILTER-014: DESIGN.md token compliance (Inputs style)
   */

  const SEARCH_DEBOUNCE_MS = 200;

  interface Props {
    onSearchApplied: (query: string) => void;
    onSearchCleared: () => void;
  }

  const { onSearchApplied, onSearchCleared }: Props = $props();

  /** Pending raw input — local state only, never dispatched to reducer mid-keystroke */
  let pendingInput = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    pendingInput = target.value;

    // Reset debounce timer on every keystroke
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onSearchApplied(pendingInput);
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Cancel pending debounce timer (EC-S-005)
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      // Clear local pending input
      pendingInput = '';
      // Dispatch immediately — no debounce for Esc
      onSearchCleared();
    }
  }
</script>

<input
  data-testid="search-input"
  type="text"
  aria-label="ノート検索"
  placeholder="検索..."
  value={pendingInput}
  oninput={handleInput}
  onkeydown={handleKeydown}
  class="search-input"
/>

<style>
  .search-input {
    /* DESIGN.md Inputs & Forms tokens (REQ-FILTER-001, REQ-FILTER-014) */
    background: #ffffff;
    color: rgba(0, 0, 0, 0.9);
    border: 1px solid #dddddd;
    padding: 6px;
    border-radius: 4px;
    font-size: 14px;
    width: 100%;
    box-sizing: border-box;
    outline: none;
  }

  .search-input::placeholder {
    /* DESIGN.md Warm Gray 300 for placeholder */
    color: #a39e98;
  }

  .search-input:focus {
    /* DESIGN.md Focus Blue (#097fe8), 2px solid, offset 2px (REQ-FILTER-013) */
    outline: 2px solid #097fe8;
    outline-offset: 2px;
  }
</style>

<script lang="ts">
  /**
   * TagFilterSidebar.svelte — Tag filter list component for the left sidebar.
   *
   * Props:
   *   entries          — TagEntry[]; the sidebar re-sorts by usageCount desc
   *   activeFilterTags — Currently selected filter tag strings
   *   onToggle         — Callback: tag filter toggled with tag name
   *   onClear          — Callback: clear all filters
   */
  import type { TagEntry } from './tagInventory.js';

  interface Props {
    entries: readonly TagEntry[];
    activeFilterTags: readonly string[];
    onToggle: (tag: string) => void;
    onClear: () => void;
  }

  const { entries, activeFilterTags, onToggle, onClear }: Props = $props();

  // REQ-TAG-009 / PROP-TAG-012: the sidebar itself owns the descending order
  // by usageCount, regardless of caller-supplied order.
  const sortedEntries = $derived(
    [...entries].sort((a, b) => b.usageCount - a.usageCount)
  );
  const hasTags = $derived(sortedEntries.length > 0);
  const hasActive = $derived(activeFilterTags.length > 0);
</script>

{#if hasTags}
  <div class="tag-filter-sidebar" data-testid="tag-filter-sidebar">
    <div class="section-label">タグフィルタ</div>

    <ul class="tag-list" role="group" aria-label="タグフィルタ">
      {#each sortedEntries as entry (entry.name)}
        {@const isActive = activeFilterTags.includes(entry.name)}
        <li>
          <button
            class="tag-filter-item"
            class:active={isActive}
            data-testid="tag-filter-item"
            data-tag-name={entry.name}
            role="checkbox"
            aria-checked={isActive ? 'true' : 'false'}
            onclick={() => onToggle(entry.name)}
          >
            <span class="tag-name">#{entry.name}</span>
            <span class="tag-count">({entry.usageCount})</span>
          </button>
        </li>
      {/each}
    </ul>

    {#if hasTags}
      <button
        class="clear-button"
        data-testid="tag-filter-clear-all"
        onclick={onClear}
      >
        すべて解除
      </button>
    {/if}
  </div>
{/if}

<style>
  .tag-filter-sidebar {
    padding: 8px;
    border-bottom: 1px solid rgba(0,0,0,0.1);
    margin-bottom: 8px;
  }

  .section-label {
    font-size: 12px;
    font-weight: 600;
    color: #615d59;
    margin-bottom: 8px;
    padding: 0 8px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .tag-list {
    list-style: none;
    padding: 0;
    margin: 0 0 8px 0;
  }

  .tag-filter-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 8px;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    text-align: left;
    color: rgba(0,0,0,0.95);
    transition: background-color 0.15s ease;
  }

  .tag-filter-item:hover {
    background-color: rgba(0,0,0,0.04);
  }

  .tag-filter-item:focus-visible {
    outline: 2px solid #097fe8;
    outline-offset: 2px;
  }

  .tag-filter-item.active {
    background-color: #f6f5f4;
    color: #0075de;
    font-weight: 500;
  }

  .tag-name {
    font-weight: 500;
  }

  .tag-count {
    color: #a39e98;
    font-size: 12px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .clear-button {
    display: inline-block;
    background: none;
    border: none;
    padding: 4px 8px;
    color: #0075de;
    font-size: 13px;
    cursor: pointer;
    border-radius: 6px;
    transition: background-color 0.15s ease;
  }

  .clear-button:hover {
    background-color: rgba(0,117,222,0.08);
  }

  .clear-button:focus-visible {
    outline: 2px solid #097fe8;
    outline-offset: 2px;
  }
</style>

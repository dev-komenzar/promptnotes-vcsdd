<script lang="ts">
  /**
   * SlashMenu.svelte — Sprint 7 Green phase
   *
   * Floating block-type selection menu. Shown when user types '/' in a block.
   * Supports keyboard navigation (arrow keys, Enter, Escape) and mouse click.
   *
   * REQ-BE-010, REQ-BE-011, REQ-BE-012
   * PROP-BE-030, PROP-BE-031, PROP-BE-032
   */

  import type { BlockType } from './types.js';

  interface BlockTypeEntry {
    type: BlockType;
    label: string;
  }

  const ALL_TYPES: BlockTypeEntry[] = [
    { type: 'paragraph', label: 'テキスト' },
    { type: 'heading-1', label: '見出し 1' },
    { type: 'heading-2', label: '見出し 2' },
    { type: 'heading-3', label: '見出し 3' },
    { type: 'bullet', label: '箇条書き' },
    { type: 'numbered', label: '番号付きリスト' },
    { type: 'code', label: 'コードブロック' },
    { type: 'quote', label: '引用' },
    { type: 'divider', label: '区切り線' },
  ];

  interface Props {
    query: string;
    onSelect: (type: BlockType) => void;
    onClose: () => void;
  }

  const { query, onSelect, onClose }: Props = $props();

  let selectedIndex = $state(0);

  const filteredTypes = $derived(
    query
      ? ALL_TYPES.filter(({ label, type }) =>
          label.toLowerCase().includes(query.toLowerCase()) ||
          type.toLowerCase().includes(query.toLowerCase())
        )
      : ALL_TYPES
  );

  // Reset selection when filter changes
  $effect(() => {
    void filteredTypes;
    selectedIndex = 0;
  });

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredTypes.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = filteredTypes[selectedIndex];
      if (entry) onSelect(entry.type);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div
  class="slash-menu"
  data-testid="slash-menu"
  role="listbox"
  aria-label="ブロックタイプを選択"
>
  {#each filteredTypes as entry, i (entry.type)}
    <button
      class="slash-menu-item"
      class:selected={i === selectedIndex}
      data-block-type={entry.type}
      role="option"
      aria-selected={i === selectedIndex}
      onclick={() => onSelect(entry.type)}
    >
      {entry.label}
    </button>
  {/each}
  {#if filteredTypes.length === 0}
    <div class="slash-menu-empty">結果なし</div>
  {/if}
</div>

<style>
  .slash-menu {
    position: absolute;
    z-index: 100;
    background: #ffffff;
    border: 1px solid #e9e9e7;
    border-radius: 6px;
    box-shadow:
      rgba(0, 0, 0, 0.02) 0px 2px 4px,
      rgba(0, 0, 0, 0.05) 0px 8px 24px;
    min-width: 200px;
    max-height: 320px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .slash-menu-item {
    display: block;
    width: 100%;
    padding: 8px 12px;
    font-size: 14px;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    color: #1f1f1f;
    transition: background 0.1s;
  }

  .slash-menu-item:hover,
  .slash-menu-item.selected {
    background: #f7f7f5;
  }

  .slash-menu-empty {
    padding: 8px 12px;
    font-size: 13px;
    color: #a39e98;
  }
</style>

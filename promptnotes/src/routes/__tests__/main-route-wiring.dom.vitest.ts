/**
 * main-route-wiring.dom.vitest.ts — Sprint 5 PROP-FEED-S5-WIRING
 *
 * Coverage: Phase 3 FIND-S5-PHASE3-001/002 resolution.
 *
 * Verifies the production composition chain (+page.svelte → FeedList → FeedRow):
 *   1. +page.svelte source contains the Sprint 5 wiring imports
 *      (subscribeEditingSessionState, createBlockEditorAdapter)
 *   2. +page.svelte source passes editingSessionState + blockEditorAdapter to FeedList
 *   3. FeedList.svelte source forwards editingSessionState + blockEditorAdapter to FeedRow
 *   4. FeedRow.svelte source uses both props in its mount predicate
 *
 * These are source-grep assertions — they protect against the regression where the
 * modules exist (PROP-FEED-S5-003 / S5-017) but nobody calls them in production.
 */

import { describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const PAGE = path.join(ROOT, 'src/routes/+page.svelte');
const FEEDLIST = path.join(ROOT, 'src/lib/feed/FeedList.svelte');
const FEEDROW = path.join(ROOT, 'src/lib/feed/FeedRow.svelte');

describe('Sprint 5 production wiring chain (+page.svelte → FeedList → FeedRow)', () => {
  test('+page.svelte imports subscribeEditingSessionState and createBlockEditorAdapter', () => {
    const src = fs.readFileSync(PAGE, 'utf-8');
    expect(src).toContain('subscribeEditingSessionState');
    expect(src).toContain('createBlockEditorAdapter');
  });

  test('+page.svelte calls subscribeEditingSessionState in $effect lifecycle', () => {
    const src = fs.readFileSync(PAGE, 'utf-8');
    // The subscription call must be present (handler wired to set $state).
    expect(src).toMatch(/subscribeEditingSessionState\(/);
    // Unsubscribe must be returned from $effect so unmount cleans up.
    expect(src).toMatch(/return\s*\(\s*\)\s*=>\s*\{[\s\S]*?unsubscribe\(\)/);
  });

  test('+page.svelte instantiates blockEditorAdapter via createBlockEditorAdapter()', () => {
    const src = fs.readFileSync(PAGE, 'utf-8');
    expect(src).toMatch(/createBlockEditorAdapter\(\)/);
  });

  test('+page.svelte passes editingSessionState and blockEditorAdapter as props to FeedList', () => {
    const src = fs.readFileSync(PAGE, 'utf-8');
    expect(src).toMatch(/<FeedList[\s\S]*?editingSessionState=\{editingSessionState\}/);
    expect(src).toMatch(/<FeedList[\s\S]*?blockEditorAdapter=\{blockEditorAdapter\}/);
  });

  test('FeedList.svelte declares editingSessionState and blockEditorAdapter in Props', () => {
    const src = fs.readFileSync(FEEDLIST, 'utf-8');
    expect(src).toMatch(/editingSessionState\?:\s*EditingSessionStateDto/);
    expect(src).toMatch(/blockEditorAdapter\?:\s*BlockEditorAdapter/);
  });

  test('FeedList.svelte forwards both props to each FeedRow', () => {
    const src = fs.readFileSync(FEEDLIST, 'utf-8');
    expect(src).toMatch(/<FeedRow[\s\S]*?editingSessionState=\{editingSessionState\}/);
    expect(src).toMatch(/<FeedRow[\s\S]*?blockEditorAdapter=\{blockEditorAdapter\}/);
  });

  test('FeedRow.svelte declares editingSessionState and blockEditorAdapter in Props', () => {
    const src = fs.readFileSync(FEEDROW, 'utf-8');
    expect(src).toMatch(/editingSessionState\?:\s*EditingSessionStateDto/);
    expect(src).toMatch(/blockEditorAdapter\?:\s*BlockEditorAdapter/);
  });

  test('FeedRow.svelte mount gate uses blockEditorAdapter and shouldMountBlocks (Sprint 6: effectiveMount)', () => {
    const src = fs.readFileSync(FEEDROW, 'utf-8');
    // Sprint 6 (REQ-FEED-030.1): mount gate consolidated as
    // `effectiveMount := shouldMountBlocks && blockEditorAdapter !== null`.
    // The block-editor-surface mounts under `{#if effectiveMount}`, and the
    // preview row-button is unmounted under `{#if !effectiveMount}`.
    expect(src).toMatch(/\$derived\(shouldMountBlocks\s*&&\s*blockEditorAdapter\s*!==\s*null\)/);
    expect(src).toMatch(/\{#if\s+effectiveMount\}/);
    expect(src).toMatch(/\{#if\s+!effectiveMount\}/);
  });
});

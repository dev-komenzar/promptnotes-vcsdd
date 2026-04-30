# Purity Boundary Audit — edit-past-note-start

**Feature**: edit-past-note-start
**Phase**: 5 (Formal Hardening)
**Reference**: specs/verification-architecture.md (Revision 3)

---

## Declared Boundaries

specs/verification-architecture.md Purity Boundary Map の宣言:

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Pre-guard | Same-note check | Effectful shell | Clock.now + emit |
| Step 1 | `classifyCurrentSession` | **Pure core** | (state, note) → decision; no ports |
| Step 2a | `flushCurrentSession` (no-current) | Pure shell (no-op) | No I/O |
| Step 2b | `flushCurrentSession` (empty) | Effectful shell | Clock.now + emit |
| Step 2c | `flushCurrentSession` (dirty) | Effectful shell | blurSave + emit + Clock.now(on fail) |
| Step 3a | Snapshot → Note hydration | **Pure core** | hydrateSnapshot port (pure function) |
| Step 3b | `startNewSession` | Effectful shell | Clock.now + emit |

**Formally verifiable core** (宣言): `classifyCurrentSession` and snapshot hydration

---

## Observed Boundaries

### classifyCurrentSession (classify-current-session.ts)

- **ポート呼び出し**: なし
- **Date.now() 呼び出し**: 0 回 (PROP-EPNS-001 Date.now spy で検証済み)
- **emit 呼び出し**: なし
- **外部副作用**: なし
- **判定**: **Pure — 宣言と一致**

### flushCurrentSession (flush-current-session.ts)

- **no-current パス**: emit 0 回、clockNow 0 回、blurSave 0 回 → 一致
- **empty パス**: clockNow 1 回 (EmptyNoteDiscarded.occurredOn)、emit 1 回 → 一致
- **dirty-success パス**: clockNow 0 回、blurSave 1 回、emit 1 回 → 一致
- **dirty-fail パス**: clockNow 1 回 (NoteSaveFailed.occurredOn)、blurSave 1 回、emit 1 回 → 一致
- **判定**: **Effectful shell — 宣言と一致**

### startNewSession (start-new-session.ts)

- **clockNow 呼び出し**: 1 回 (NewSession.startedAt + EditorFocusedOnPastNote.occurredOn)
- **emit 呼び出し**: 1 回 (EditorFocusedOnPastNote)
- **判定**: **Effectful shell — 宣言と一致**

### pipeline.ts (orchestrator)

- **Pre-guard clockNow**: 1 回 (same-note path only)
- **classify**: ポートなし (pure)
- **flush + startNewSession**: ポート委譲
- **判定**: **Effectful shell — 宣言と一致**

---

## Summary

**PASS** — すべての宣言された境界が実装と一致。

- Pure core: `classifyCurrentSession` は PROP-EPNS-001 (fast-check 1000 runs) で純粋性を検証済み
- Effectful shell: すべてのポート呼び出しは明示的なポートインターフェース経由
- Clock.now() budget: 全5パスのカウントがテストで検証済み
- Date.now() 直接呼び出し: 0 件 (Sprint 1 FIND-001 で修正済み)

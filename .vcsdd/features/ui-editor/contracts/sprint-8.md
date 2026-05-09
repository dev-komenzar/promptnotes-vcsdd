---
sprintNumber: 8
feature: ui-editor
status: draft
negotiationRound: 1
scope: >
  IPC Payload Rust Block Migration (Option B). Replace the legacy 6-flat-field
  `EditingSessionStateDto` (Rust struct in `promptnotes/src-tauri/src/editor.rs`) with the
  5-arm tagged union (`Idle | Editing | Saving | Switching | SaveFailed`) defined in
  Sprint 8 spec (REQ-IPC-001..020). Add `BlockTypeDto` (9 kebab-case variants enum),
  `DtoBlock`, `PendingNextFocusDto`. Replace the legacy 6-positional-arg
  `make_editing_state_changed_payload(status, isDirty, currentNoteId, pendingNextNoteId,
  lastError, body)` with the singular form `make_editing_state_changed_payload(state:
  &EditingSessionStateDto)`. Implement six `compose_state_*` constructors that the
  Tauri handlers call. Update `editor.rs` handlers (`save_note_and_emit`,
  `discard_current_session`, `cancel_switch`, `request_new_note`) and
  `feed.rs::select_past_note` to use the new helper. Add a `tests/wire_audit.sh` grep
  audit (PROP-IPC-012/020/021), a `print_wire_fixtures` Rust test that emits the
  §10.2.1 14-fixture cover set as JSON, and a TS-side fixture narrowing test
  (`editorStateChannelWireFixtures.dom.vitest.ts`, PROP-IPC-011/022). Migrate existing
  `tests/editor_handlers.rs` and `tests/feed_handlers.rs` to the new variant shape.
  TS-side application logic (reducer, view-state, DOM tests) is OUT-OF-SCOPE except for
  the new fixture narrowing test and a PROP-IPC-023 placeholder in
  `editorReducer.test.ts`.
criteria:
  - id: CRIT-800
    dimension: spec_fidelity
    description: >
      REQ-IPC-001..020 wire-shape coverage — every Sprint 8 REQ-IPC has at least one
      asserting test in `promptnotes/src-tauri/tests/editor_wire_sprint8.rs` or
      `promptnotes/src-tauri/tests/editor_handlers.rs`. Specifically: REQ-IPC-001 (5-arm
      union), REQ-IPC-002 (currentNoteId on non-idle), REQ-IPC-003 (isNoteEmpty on
      non-idle), REQ-IPC-004..007 (per-variant exact key set), REQ-IPC-008
      (PendingNextFocusDto), REQ-IPC-009 (DtoBlock with BlockTypeDto), REQ-IPC-010
      (SaveErrorDto skip-when-None), REQ-IPC-011 (blocks optionality), REQ-IPC-012
      (state wrapper), REQ-IPC-013..018 (caller-site contracts), REQ-IPC-019..020
      (TS↔Rust shape, round-trip).
    weight: 0.18
    passThreshold: >
      `cd promptnotes/src-tauri && cargo test --tests` exits 0 with all 91 tests passing
      (43 unit + 18 editor_handlers + 22 editor_wire_sprint8 + 8 feed_handlers; the
      editor_wire_sprint8 count includes the iter-3 additions of
      `prop_ipc_006_saving_key_set_equality` and `ec_ipc_013_whitespace_only_body_is_not_empty`). The Sprint 8 test header
      in `tests/editor_wire_sprint8.rs` documents the REQ-IPC ↔ test mapping (lines
      30-65 — the "Spec REQ / EC coverage map" comment block); each of REQ-IPC-001..020
      is mapped to at least one `prop_ipc_*` test name. The map is verified by
      `grep -E '^///\\s+REQ-IPC-0(0[1-9]|1[0-9]|20)' promptnotes/src-tauri/tests/editor_wire_sprint8.rs
      | wc -l` returning 20. `grep -nE 'PROP-IPC-' promptnotes/src-tauri/tests/editor_wire_sprint8.rs`
      produces at least one match for each of PROP-IPC-001..010, PROP-IPC-013..019.
      Cross-language and grep-audit PROPs (PROP-IPC-011, 012, 020..023) are not
      cargo-test-driven; they are fulfilled by `editorStateChannelWireFixtures.dom.vitest.ts`,
      `wire_audit.sh`, and `editorReducer.test.ts`'s `it.todo` placeholder respectively.

  - id: CRIT-801
    dimension: spec_fidelity
    description: >
      EC-IPC-001..014 edge-case coverage — every Sprint 8 EC-IPC appears in at least one
      asserting fixture or test in `tests/editor_wire_sprint8.rs`. EC-IPC-001 (save success
      → editing not idle), EC-IPC-002 (validation error reason None → key absent),
      EC-IPC-003 (fs+permission reason Some), EC-IPC-004..005 (blocks optionality),
      EC-IPC-006..008 (null-literal serialization for focus fields), EC-IPC-009 (idle
      narrowing), EC-IPC-010..011 (select_past_note empty body / missing metadata),
      EC-IPC-012..013 (cancel without save-failed / whitespace-only body), EC-IPC-014
      (emit-before-subscribe — documentation only).
    weight: 0.08
    passThreshold: >
      The "Spec REQ / EC coverage map" comment block at
      `promptnotes/src-tauri/tests/editor_wire_sprint8.rs:30-65` documents the EC-IPC ↔
      test mapping for all 14 edge cases. Verified by
      `grep -E '^///\\s+EC-IPC-0(0[1-9]|1[0-4])' promptnotes/src-tauri/tests/editor_wire_sprint8.rs
      | wc -l` returning 14. EC-IPC-014 is documentation-only (mount-order obligation on
      the EditorPanel); the other 13 each map to a concrete test in editor_wire_sprint8.rs
      or feed_handlers.rs.

  - id: CRIT-802
    dimension: verification_architecture
    description: >
      PROP-IPC-001..023 obligation execution — Tier 0/1/2 verification mechanisms run and
      pass per §10.5. Tier 0 exhaustiveness via match (PROP-IPC-001, PROP-IPC-018). Tier 1
      unit (PROP-IPC-002..009, PROP-IPC-013..017, PROP-IPC-019). Tier 2 round-trip cover
      set (PROP-IPC-010 over §10.2.1 14 fixtures). TS↔Rust generated fixtures
      (PROP-IPC-011, PROP-IPC-022) via `cargo test print_wire_fixtures` →
      `editorStateChannelWireFixtures.dom.vitest.ts`. Grep audits (PROP-IPC-012,
      PROP-IPC-020, PROP-IPC-021) via `tests/wire_audit.sh`.
    weight: 0.16
    passThreshold: >
      `cd promptnotes/src-tauri && cargo test print_wire_fixtures` writes
      `tests/fixtures/wire-fixtures.json` with 14 fixture entries.
      `cd promptnotes && bun run vitest run editorStateChannelWireFixtures` exits 0 with
      4/4 tests PASS. `bash promptnotes/src-tauri/tests/wire_audit.sh` exits 0 with
      `PASS: 3 / FAIL: 0`.

  - id: CRIT-803
    dimension: edge_case_coverage
    description: >
      Round-trip cover set (§10.2.1) — exactly 14 fixtures, one per spec-table row, each
      asserting `serde_json::from_str::<EditingSessionStateDto>(&serde_json::to_string(&v)
      .unwrap()).unwrap() == v`. The cover set includes at least one `Editing` fixture
      with `blocks: Some([nonEmpty])` carrying multiple `BlockTypeDto` variants, exercising
      PROP-IPC-019 round-trip in passing. The fixture file
      `promptnotes/src-tauri/tests/fixtures/wire-fixtures.json` contains exactly 14 entries.
    weight: 0.10
    passThreshold: >
      `prop_ipc_010_round_trip_cover_set` test passes. The generated
      `tests/fixtures/wire-fixtures.json` is a JSON array of length 14 (verified by
      `jq 'length'`). At least one fixture has `state.blocks` non-empty, and the
      enumerated `BlockTypeDto` variants in fixtures cover ≥4 of the 9 types.

  - id: CRIT-804
    dimension: wire_contract_consistency
    description: >
      No legacy 6-flat-field shape remains in the Rust codebase. The struct form of
      `EditingSessionStateDto` is gone; the `body` field is removed; the 6-positional
      `make_editing_state_changed_payload` is gone. PROP-IPC-021 grep audit catches any
      regression. The TS side `EditingSessionStateDto` continues to be the source of truth
      for variant key sets; Rust serialization matches Set-equality on every variant.
    weight: 0.10
    passThreshold: >
      The legacy 6-positional helper form is absent from `promptnotes/src-tauri/src/`.
      `bash promptnotes/src-tauri/tests/wire_audit.sh` reports
      `PASS: PROP-IPC-021: No legacy 6-arg make_editing_state_changed_payload found
      (single+multi-line scan)`. The PROP-IPC-021 audit performs both a single-line regex
      and a multi-line awk-based scan that flattens the call expression across newlines,
      so a multi-line legacy regression cannot evade detection. Additionally,
      `grep -n "is_dirty: bool" promptnotes/src-tauri/src/editor.rs` returns matches only
      inside the `Editing` variant block (verifiable by surrounding `enum
      EditingSessionStateDto` / `Editing {` context). `grep -n '"body"'
      promptnotes/src-tauri/src/editor.rs` returns no struct-field occurrences.

  - id: CRIT-805
    dimension: wire_contract_consistency
    description: >
      `skip_serializing_if = "Option::is_none"` is restricted to the allow-list per
      §15.5: only on `SaveErrorDto::reason` and `blocks: Option<Vec<DtoBlock>>` on each
      non-idle variant. The focus-related fields (`Editing::focused_block_id`,
      `SaveFailed::prior_focused_block_id`, `SaveFailed::pending_next_focus`) MUST NOT
      carry the annotation; they serialize the literal JSON `null` when None.
      PROP-IPC-020 grep audit enforces this.
    weight: 0.06
    passThreshold: >
      `bash promptnotes/src-tauri/tests/wire_audit.sh` reports
      `PASS: PROP-IPC-020: All skip_serializing_if annotations are on the allow-list`.
      `prop_ipc_005_save_failed_null_literals_present` passes. The generated fixture file
      contains the literal substring `"priorFocusedBlockId":null` and
      `"pendingNextFocus":null` for at least one SaveFailed fixture.

  - id: CRIT-806
    dimension: wire_contract_consistency
    description: >
      `BlockTypeDto` is a typed enum (9 variants) with kebab-case serde rename; round-trip
      from invalid strings returns `Err` (PROP-IPC-019). The contract is enforced at
      compile-time on the Rust side and at runtime on the TS narrowing side via the
      `BlockType` literal union.
    weight: 0.05
    passThreshold: >
      `prop_ipc_018_block_type_dto_nine_variants` passes (exhaustive match on 9 variants).
      `prop_ipc_019_block_type_dto_round_trip_valid` passes for all 9 valid kebab-case
      strings. `prop_ipc_019_block_type_dto_invalid_strings` passes for `"hedaing-1"`,
      `"Paragraph"`, `""`, all returning `Err`.

  - id: CRIT-807
    dimension: out_of_scope_discipline
    description: >
      OUT-OF-SCOPE items are NOT touched. Sprint 8 does NOT modify TS-side
      `EditingSessionStateDto` (already block-aware), `editorReducer.ts`'s core
      DomainSnapshotReceived handler logic (only a TODO comment + an `it.todo`
      placeholder for PROP-IPC-023), Capture domain types, or `ui-feed-list-actions`
      Sprint 4 spec. The body parameter on the legacy helper is REMOVED and not
      reintroduced anywhere.
    weight: 0.05
    passThreshold: >
      `git diff main..HEAD -- promptnotes/src/lib/editor/types.ts` shows no functional
      change (only optional whitespace / comments). `git diff main..HEAD -- promptnotes/src/lib/editor/editorReducer.ts`
      shows only a TODO comment addition and no logic change.
      `git diff main..HEAD -- docs/domain/code/` is empty.

  - id: CRIT-808
    dimension: spec_fidelity
    description: >
      The singular `make_editing_state_changed_payload(state: &EditingSessionStateDto)`
      helper is the SOLE constructor used at every emit site in `editor.rs` and `feed.rs`.
      All compose functions (`compose_state_idle`, `compose_state_for_save_ok`,
      `compose_state_for_save_err`, `compose_state_for_cancel_switch`,
      `compose_state_for_request_new_note`, `compose_state_for_select_past_note`) exist
      and are pure (no I/O, no AppHandle).
    weight: 0.06
    passThreshold: >
      `grep -nE 'fn compose_state_(idle|for_(save_ok|save_err|cancel_switch|request_new_note|select_past_note))'
      promptnotes/src-tauri/src/editor.rs` returns 6 distinct matches.
      `grep -nE 'app\.emit\("editing_session_state_changed"' promptnotes/src-tauri/src/`
      returns matches whose preceding 5 lines all include
      `make_editing_state_changed_payload(`.

  - id: CRIT-809
    dimension: spec_fidelity
    description: >
      Per-handler integration tests (PROP-IPC-013..017) — at least one test per Tauri
      handler asserts the expected variant + field values. compose_state_idle,
      compose_state_for_cancel_switch, compose_state_for_request_new_note,
      compose_state_for_save_ok / save_err, compose_state_for_select_past_note are each
      covered by a `prop_ipc_013_*` through `prop_ipc_017_*` test (or the documented
      equivalent).
    weight: 0.06
    passThreshold: >
      `cargo test prop_ipc_013_compose_idle prop_ipc_014_compose_cancel_switch
      prop_ipc_015_compose_request_new_note prop_ipc_016_compose_save_ok_and_err
      prop_ipc_017_compose_select_past_note --test editor_wire_sprint8` exits 0 with
      all 5 (or grouped equivalents) PASS.

  - id: CRIT-810
    dimension: out_of_scope_discipline
    description: >
      The Phase 1c gate verdict is not contradicted: deferred items remain deferred.
      Block-aware payload emission from `select_past_note` (deferred to
      `ui-feed-list-actions` Sprint 4) is NOT introduced. `pendingNextFocus` propagation
      through save handlers (deferred to Sprint 9) is NOT introduced. The TS-side
      reducer's DomainSnapshotReceived handler is not rewritten.
    weight: 0.05
    passThreshold: >
      `compose_state_for_select_past_note(...)` produces `Editing { blocks: None, .. }`
      regardless of body content. The save handlers (`compose_state_for_save_err`) emit
      `SaveFailed { pending_next_focus: None, .. }` for all inputs. PROP-IPC-023 lives
      as `it.todo` in `editorReducer.test.ts` (no functional implementation in this sprint).

  - id: CRIT-811
    dimension: edge_case_coverage
    description: >
      Existing TS test suite is not regressed. The block-aware DOM tests (220 tests in
      `promptnotes/src/lib/**/__tests__/`) continue to pass after the Sprint 8 IPC
      migration. The new fixture narrowing test (4 tests) is additive.
    weight: 0.05
    passThreshold: >
      `cd promptnotes && bun run vitest run` exits 0 with 220+/220+ tests passing
      (220 pre-Sprint 8 + 4 new = 224, exact count may vary by ±1 if the
      editorReducer.test.ts placeholder is added).
---

# Sprint 8 Contract — IPC Payload Rust Block Migration (Option B)

This contract pins the implementation expectations for Sprint 8 of `ui-editor`. The
sprint is a **wire-protocol migration**: the Rust-side `EditingSessionStateDto`
moves from a legacy 6-flat-field struct to a 5-arm tagged union that mirrors the
TS-side discriminated union introduced in Sprint 7.

The 12 criteria (CRIT-800..811) cover the 5 strict-mode dimensions:

- **spec_fidelity**: CRIT-800, CRIT-801, CRIT-808, CRIT-809
- **verification_architecture**: CRIT-802
- **edge_case_coverage**: CRIT-803, CRIT-811
- **wire_contract_consistency**: CRIT-804, CRIT-805, CRIT-806
- **out_of_scope_discipline**: CRIT-807, CRIT-810

Total weight: 0.18 + 0.08 + 0.16 + 0.10 + 0.10 + 0.06 + 0.05 + 0.05 + 0.06 + 0.06 + 0.05 + 0.05 = 1.00

The `passThreshold` of each criterion is a concrete, machine-checkable invocation.
Phase 5 (formal hardening) re-runs every threshold; this contract is the source of
truth for the convergence checker.

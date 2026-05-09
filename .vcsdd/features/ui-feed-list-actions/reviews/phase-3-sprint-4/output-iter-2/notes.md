# Sprint 4 Phase 3 iter-2 — adversary notes

## iter-1 findings status (2/3 fully or partially closed; 1 not closed)

- FIND-S4-IMPL-001 (PROP-FEED-S4-016 missing TS-side parity test) — **PARTIALLY_RESOLVED.** parserParity.test.ts now exists with the canonical fixture and a 6-case suite. The canonical-fixture pair (`# heading\n\nparagraph`) is the spec-gating snapshot and it passes structural type/content equivalence. However, the test imports `$lib/domain/capture-auto-save/parse-markdown-to-blocks`, not the canonical TS reference at `docs/domain/code/ts/src/shared/blocks.ts`. The chosen runtime returns `Ok([])` for empty/whitespace input, which the test asserts as expected, while the Rust side returns `Ok([paragraph("")])` per the non-empty invariant. The spec text (lines 716–723) explicitly claims these two implementations are consistent. They are not. See FIND-S4-IMPL-iter2-001.

- FIND-S4-IMPL-002 (select_past_note integration tests are helper re-implementations, not handler invocations) — **NOT_RESOLVED.** The new `integration_smoke_select_past_note_handler_logic` test does not call `feed::select_past_note`. It calls the same four helpers (scan, parse, compose, make_payload) directly that iter-1 flagged. The added doc-comment defers EC-FEED-017 emit-order verification to Sprint 5 citing Tauri's `test` feature requiring nightly. The deferral is plausible for the AppHandle route but iter-1's remediation also proposed a Mock Emitter trait route that requires no Tauri test feature; that route was not attempted. See FIND-S4-IMPL-iter2-002.

- FIND-S4-IMPL-003 (canonical fixture snapshot missing) — **RESOLVED.** `prop_s4_016b_canonical_two_block_snapshot` uses the exact spec fixture and asserts len==2, [0]=Heading1/`heading`, [1]=Paragraph/`paragraph`. Pairs symmetrically with parserParity.test.ts.

## Why the verdict is FAIL

iter-1 FAIL was driven by 3 medium findings. iter-2 closes 1.5 of them and introduces 2 new medium findings of identical structure (test does not actually exercise the surface its name claims; spec/test internal contradiction). Net: still 2 unresolved medium issues in `test_quality`, both pre-existing concerns dressed up rather than fixed. Per VCSDD adversary rules, any FAIL dimension forces overall FAIL, and partial resolution of a closed finding does not count as closure.

Other dimensions (spec_fidelity, implementation_correctness, purity_boundary, wire_compatibility) are regression-only reviews. spec_fidelity also FAILs because the test as written codifies an internal contradiction with the spec text — this is a spec-vs-test divergence, not just a test-quality issue.

## Routing recommendation for Phase 4

1. **Highest priority (blocks Phase 5 gate)**: route FIND-S4-IMPL-iter2-001 to **Phase 1c spec amendment + Phase 2c test/code adjustment**. Either fix the spec text in behavioral-spec.md:716–723 to declare the empty-input branch as a deliberate IPC boundary divergence, OR fix the chosen TS implementation to honour the non-empty invariant for the IPC parity test. Without this, PROP-FEED-S4-016 cannot honestly claim cross-language parity.

2. **Second priority**: route FIND-S4-IMPL-iter2-002 to **Phase 2c (refactor + test)**. Introduce a `TestEmitter` mock or split out a pure `select_past_note_compose` so that handler regressions (missing parse step, wrong args to compose, missing editor emit) are detected by tests, not only code review. This does not require Tauri's `test` feature.

3. If the team chooses to defer FIND-S4-IMPL-iter2-002 to Sprint 5 (legitimate scope decision), it must be **escalated** with explicit written acknowledgement that REQ-FEED-024 / EC-FEED-017 emit-order coverage is verified by code review only through Sprint 4, and a Sprint 5 backlog item must be filed before this verdict can be overridden.

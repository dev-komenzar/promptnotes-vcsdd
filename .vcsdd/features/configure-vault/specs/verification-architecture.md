# Verification Architecture: ConfigureVault

**Feature**: `configure-vault`
**Phase**: 1b
**Revision**: 1
**Mode**: lean
**Source**:
- `docs/domain/workflows.md` Workflow 9
- `docs/domain/code/ts/src/shared/value-objects.ts` (`VaultPath`, `VaultId`, `Timestamp`)
- `docs/domain/code/ts/src/shared/errors.ts` (`FsError`, `VaultConfigError`)
- `docs/domain/code/ts/src/shared/events.ts` (`VaultDirectoryConfigured`, `PublicDomainEvent`)
- `docs/domain/code/rust/src/vault/aggregate.rs` (`Vault::configure`)
- `docs/domain/code/rust/src/vault/ports.rs` (`SettingsPort`, `FileSystemPort`, `ClockPort`)
- behavioral-spec.md REQ-001 .. REQ-014

---

## Purity Boundary Map

| Sub-step | Function | Classification | Rationale |
|----------|----------|----------------|-----------|
| 1 | `FileSystem.statDir(path)` | **Effectful shell** | Read I/O — OS filesystem; can return `Ok(true)`, `Ok(false)`, or `Err(FsError)` |
| 2 | `mapStatDirResult(result, path)` | **Pure core** | `(Result<boolean, FsError>, string) → Result<void, VaultConfigError>`; total, deterministic; property-test target |
| 3 | `Settings.save(path)` | **Effectful shell** | Write I/O — settings persistence; called only after step 1 succeeds |
| 4 | `mapSettingsSaveError(fsError, path)` | **Pure core** | `(FsError, string) → VaultConfigError`; total, deterministic; property-test target |
| 5 | `validateAndTransitionVault(vaultId, path, now)` | **Pure core** | `(VaultId, VaultPath, Timestamp) → Vault`; state-machine transition; deterministic, no ports; property-test target |
| 6 (success only) | `Clock.now()` | **Effectful (purity-violating)** | OS time read; gated to success path only, acquired after `Settings.save` returns `Ok` |
| 7 (success only) | `EventBus.publish(VaultDirectoryConfigured)` | **Effectful shell** | Public domain event bus; success path only; exactly once |

**Formally verifiable core**: `mapStatDirResult`, `mapSettingsSaveError`, `validateAndTransitionVault`.

**Effectful shell**: `statDir` (always exactly once), `Settings.save` (success + settings-failure paths), `Clock.now` and `EventBus.publish` (success path only).

**Pipeline shape**:

```
VaultPath
  │
  ▼
[statDir(path)] → Result<boolean, FsError>
  │
  ├─ Ok(false) or Err(*) ──→ [mapStatDirResult] → Err(VaultConfigError)  (exit; no Settings.save)
  │
  └─ Ok(true) ──────────────────────────────────────────────────────────┐
                                                                        ▼
                                                               [Settings.save(path)] → Result<void, FsError>
                                                                        │
                                                                        ├─ Err(*) → [mapSettingsSaveError] → Err(VaultConfigError)  (exit)
                                                                        │
                                                                        └─ Ok(void)
                                                                                │
                                                                                ▼
                                                                        [Clock.now()] → Timestamp
                                                                                │
                                                                                ▼
                                                            [validateAndTransitionVault(vaultId, path, now)] → Vault
                                                                                │
                                                                                ▼
                                                                     Ok(VaultDirectoryConfigured)
                                                                     + EventBus.publish(event)
```

---

## Port Contracts

Port signatures match `docs/domain/code/rust/src/vault/ports.rs` (Rust) and the TypeScript mirror pattern from `load-vault-config.ts`.

### Used by ConfigureVault

```typescript
// ── FileSystem ─────────────────────────────────────────────────────────
/** Stat the given path. Ok(true) = exists and is a directory.
 *  Ok(false) = path does not name a directory (file or absent).
 *  Err(FsError) = OS error.
 *  Called exactly once per configureVault invocation.
 *  Source: ports.rs FileSystemPort.stat_dir */
type StatDir = (path: string) => Result<boolean, FsError>;

// ── Settings ───────────────────────────────────────────────────────────
/** Persist the vault path to the settings store.
 *  Called exactly once, only after statDir returns Ok(true).
 *  Source: ports.rs SettingsPort.save */
type SettingsSave = (path: VaultPath) => Result<void, FsError>;

// ── Clock ──────────────────────────────────────────────────────────────
/** Return the current wall-clock time as Timestamp.
 *  Called at most once per configureVault invocation, only on success path
 *  after Settings.save returns Ok.
 *  Source: ports.rs ClockPort.now */
type ClockNow = () => Timestamp;

// ── EventBus ───────────────────────────────────────────────────────────
/** Publish VaultDirectoryConfigured to the public domain event bus.
 *  Called exactly once on success, zero times on failure.
 *  Source: events.ts PublicDomainEvent union (VaultDirectoryConfigured is a member). */
type EmitPublic = (event: VaultDirectoryConfigured) => void;
```

### NOT used by ConfigureVault

- `Settings.load` — only AppStartup / `loadVaultConfig` reads settings.
- `FileSystem.listMarkdown` / `readFile` / `writeFileAtomic` / `trashFile` — file I/O beyond stat is not part of this workflow.
- `AllocateNoteId` — Vault Note ID allocation is AppStartup / NewNote concern.
- All `ClipboardWrite` — Capture context.

### Pure helper contracts

```typescript
// ── mapStatDirResult (pure) ─────────────────────────────────────────────
/** Maps (Result<boolean, FsError>, pathStr) → Result<void, VaultConfigError>.
 *  Pure, total, no ports. Implements the collapse rule:
 *    Ok(true)              → Ok(void)          (directory confirmed)
 *    Ok(false)             → path-not-found
 *    Err(not-found)        → path-not-found
 *    Err(permission)       → permission-denied
 *    Err(disk-full|lock|unknown) → path-not-found */
type MapStatDirResult = (
  statResult: Result<boolean, FsError>,
  pathStr: string,
) => Result<void, VaultConfigError>;

// ── mapSettingsSaveError (pure) ─────────────────────────────────────────
/** Maps (FsError, pathStr) → VaultConfigError for Settings.save failures.
 *  Pure, total, no ports.
 *    Err(permission)       → permission-denied
 *    Err(disk-full|lock|unknown|not-found) → path-not-found */
type MapSettingsSaveError = (
  fsError: FsError,
  pathStr: string,
) => VaultConfigError;

// ── validateAndTransitionVault (pure) ──────────────────────────────────
/** Pure state-machine transition. Mirrors Vault::configure from aggregate.rs.
 *  Accepts Unconfigured or Ready input; returns Ready { path }.
 *  No ports. Deterministic. Property-test target.
 *  Scanning is not a valid input (caller precondition). */
type ValidateAndTransitionVault = (
  vaultId: VaultId,
  path: VaultPath,
  now: Timestamp,
) => Vault;
```

---

## Proof Obligations

| ID | Tier | Required | Statement | Verification | REQ |
|----|-----:|:--------:|-----------|--------------|-----|
| **PROP-CV-001** | 1 | **true** | `mapStatDirResult` is pure: same `(Result<boolean, FsError>, pathStr)` always produces identical `Result<void, VaultConfigError>` | Property test (`fast-check`): repeated calls with the same inputs return structurally equal results | REQ-002, REQ-003, REQ-004, REQ-005 |
| **PROP-CV-002** | 1 | **true** | `mapStatDirResult` collapse rule: `Ok(true)` → Ok; `Ok(false)` → path-not-found; `Err(not-found)` → path-not-found; `Err(permission)` → permission-denied; `Err(disk-full\|lock\|unknown)` → path-not-found | Property test: enumerate all 7 `(statResult, path)` combinations; assert exact `VaultConfigError.kind` | REQ-002, REQ-003, REQ-004, REQ-005 |
| **PROP-CV-003** | 1 | **true** | `mapSettingsSaveError` collapse rule: `Err(permission)` → permission-denied; all other `FsError` kinds → path-not-found | Property test: enumerate all 5 `FsError.kind` values; assert correct `VaultConfigError.kind` | REQ-006, REQ-007 |
| **PROP-CV-004** | 1 | **true** | `validateAndTransitionVault` is pure: same `(vaultId, path, now)` always returns a structurally identical `Vault` with `status.kind === "Ready"` and `status.path === path` | Property test: arbitrary `(VaultId, VaultPath, Timestamp)` inputs; assert purity and `Ready` invariant | REQ-008 |
| **PROP-CV-005** | 1 | **true** | I/O budget per path: (success) 1 statDir / 1 settingsSave / 1 clockNow / 1 emit; (statDir failure) 1 / 0 / 0 / 0; (Settings failure) 1 / 1 / 0 / 0 | Spy-based tests: instrument all four ports; run configureVault on each path; assert call counts match REQ-013 budget table | REQ-013 |
| **PROP-CV-006** | 1 | **true** | Exactly one `VaultDirectoryConfigured` emitted on success; zero on any failure | Spy on `EventBus.publish`; assert count per path | REQ-001, REQ-011 |
| **PROP-CV-007** | 0 | **true** | `VaultConfigError` exhaustiveness: the three variants (`unconfigured`, `path-not-found`, `permission-denied`) cover all pipeline error branches; TypeScript `switch` over `VaultConfigError.kind` compiles with a `never` branch; `unconfigured` is provably not produced by ConfigureVault | TypeScript compile-time exhaustiveness check (never branch in switch); runtime test enumerates all statDir and Settings.save error permutations and asserts none produce `unconfigured` | REQ-002 through REQ-007 |
| **PROP-CV-008** | 1 | **true** | Port-call ordering: `Settings.save` is never called when `statDir` did not return `Ok(true)` | Spy-based test: stub `statDir` to each non-Ok(true) outcome; assert `settingsSave` spy call count === 0 for every failure variant | REQ-009 |
| **PROP-CV-009** | 1 | **true** | `Clock.now()` at-most-once and only on success path: zero calls on all failure paths, exactly one call on success | Spy on `clockNow`; run on success and each failure path; assert count | REQ-010 |
| **PROP-CV-010** | 1 | false | `Clock.now()` return value is the `VaultDirectoryConfigured.occurredOn` field | Example-based test: stub `clockNow` to return a sentinel `Timestamp`; assert `event.occurredOn` equals sentinel | REQ-001, REQ-010 |
| **PROP-CV-011** | 2 | false | `validateAndTransitionVault` on `Ready` input (repeat configure): returns `Ready` with the new path; the old path is not retained | Example-based test: provide a `Ready` vault with path A; call with path B; assert result is `Ready { path: B }` | REQ-008 |
| **PROP-CV-012** | 2 | false | `VaultDirectoryConfigured` field fidelity: `event.path === inputPath`, `event.vaultId === vaultId port`, `event.kind === "vault-directory-configured"` | Example-based test: concrete success invocation; assert all event fields | REQ-001, REQ-011 |
| **PROP-CV-013** | 2 | false | `Settings.save` failure with `permission` error maps to `permission-denied` (not `path-not-found`) | Example-based test: statDir Ok(true), settingsSave Err(permission) → assert `error.kind === "permission-denied"` | REQ-006 |
| **PROP-CV-014** | 2 | false | `Settings.save` failure with `disk-full` error maps to `path-not-found` | Example-based test: statDir Ok(true), settingsSave Err(disk-full) → assert `error.kind === "path-not-found"` | REQ-007 |

### Tier definitions

- **Tier 0** — Type-level / compile-time only (TypeScript exhaustiveness, never branch). No runtime test needed; the type system enforces it at compile time.
- **Tier 1** — Property-based or spy-based runtime tests with `fast-check` (≥100 runs for property tests). These cover the required invariants.
- **Tier 2** — Example-based unit tests. Concrete inputs and expected outputs; verifies specific behaviors not easily expressed as properties.
- **Tier 3** — Integration test. Not required at lean mode.

Lean mode chooses Tier 0/1 for required props. Tier 2 props are non-required but SHOULD be included as they are cheap to write.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-001 | PROP-CV-005, PROP-CV-006, PROP-CV-010, PROP-CV-012 |
| REQ-002 | PROP-CV-001, PROP-CV-002, PROP-CV-007 |
| REQ-003 | PROP-CV-001, PROP-CV-002, PROP-CV-007 |
| REQ-004 | PROP-CV-001, PROP-CV-002, PROP-CV-007 |
| REQ-005 | PROP-CV-001, PROP-CV-002, PROP-CV-007 |
| REQ-006 | PROP-CV-003, PROP-CV-005, PROP-CV-008, PROP-CV-013 |
| REQ-007 | PROP-CV-003, PROP-CV-005, PROP-CV-014 |
| REQ-008 | PROP-CV-004, PROP-CV-011 |
| REQ-009 | PROP-CV-005, PROP-CV-008 |
| REQ-010 | PROP-CV-005, PROP-CV-009, PROP-CV-010 |
| REQ-011 | PROP-CV-006, PROP-CV-007, PROP-CV-012 |
| REQ-012 | PROP-CV-004, PROP-CV-008 |
| REQ-013 | PROP-CV-005 |
| REQ-014 | PROP-CV-005, PROP-CV-006 (integration shape) |

Every requirement has at least one proof obligation. Nine `required: true` obligations (PROP-CV-001 through PROP-CV-009) cover the highest-risk invariants spanning Tiers 0–1. Total proof obligations: 14 (PROP-CV-001 through PROP-CV-014).

---

## Test Harness Layout

Tests live under `promptnotes/src/lib/domain/__tests__/configure-vault/`:

```
configure-vault/
  pipeline.test.ts                           # REQ-001 through REQ-013 (integration with port stubs)
  vault-transition.test.ts                   # REQ-008 (pure unit)
  error-mapping.test.ts                      # REQ-002 through REQ-007 (pure unit: mapStatDirResult, mapSettingsSaveError)
  __verify__/
    prop-cv-001-map-stat-dir-purity.harness.test.ts
    prop-cv-002-stat-dir-collapse-rule.harness.test.ts
    prop-cv-003-settings-save-error-collapse.harness.test.ts
    prop-cv-004-vault-transition-purity.harness.test.ts
    prop-cv-005-io-budget.harness.test.ts
    prop-cv-006-event-emission-count.harness.test.ts
    prop-cv-007-vault-config-error-exhaustive.harness.test.ts
    prop-cv-008-stat-dir-before-settings-save.harness.test.ts
    prop-cv-009-clock-now-budget.harness.test.ts
```

Implementation lives under `promptnotes/src/lib/domain/configure-vault/`:

```
configure-vault/
  pipeline.ts                  # configureVault(deps, input): Result<VaultDirectoryConfigured, VaultConfigError>
  validate-and-transition.ts   # validateAndTransitionVault(vaultId, path, now): Vault  (pure)
  map-stat-dir-result.ts       # mapStatDirResult(statResult, pathStr): Result<void, VaultConfigError>  (pure)
  map-settings-save-error.ts   # mapSettingsSaveError(fsError, pathStr): VaultConfigError  (pure)
```

Note: error mapping is split into two files (`map-stat-dir-result.ts`, `map-settings-save-error.ts`) rather than a single `error-mapping.ts`; the pure helper is `validate-and-transition.ts` (not `vault-transition.ts`).

---

## Type-Level Contracts

```typescript
// ── ConfigureVaultPorts (pipeline.ts) ───────────────────────────────────
export type ConfigureVaultPorts = {
  readonly statDir: (path: string) => Result<boolean, FsError>;
  readonly settingsSave: (path: VaultPath) => Result<void, FsError>;
  readonly clockNow: () => Timestamp;
  readonly emit: (event: VaultDirectoryConfigured) => void;
  /** Singleton Vault ID; injected so the pipeline is testable without a live Vault aggregate. */
  readonly vaultId: VaultId;
};

// ── Pipeline entry point (pipeline.ts) ─────────────────────────────────
export function configureVault(
  ports: ConfigureVaultPorts,
  userSelectedPath: VaultPath,
): Result<VaultDirectoryConfigured, VaultConfigError>;

// ── Pure state-machine transition (validate-and-transition.ts) ────────
export function validateAndTransitionVault(
  vaultId: VaultId,
  path: VaultPath,
  now: Timestamp,
): Vault;

// ── Pure error mappers (map-stat-dir-result.ts, map-settings-save-error.ts) ──
export function mapStatDirResult(
  statResult: Result<boolean, FsError>,
  pathStr: string,
): Result<void, VaultConfigError>;

export function mapSettingsSaveError(
  fsError: FsError,
  pathStr: string,
): VaultConfigError;
```

The `Pick`-style narrowing makes explicit that `configureVault` touches only `statDir`, `settingsSave`, `clockNow`, and `emit` from the infrastructure boundary (REQ-013).

---

## Findings to Carry Forward

| Finding | Target Phase | Description |
|---------|--------------|-------------|
| `Settings.save` non-permission errors map to `path-not-found` | 1c review | The MVP `VaultConfigError` union has no `settings-write-failed` variant. Mapping `disk-full`/`lock`/`unknown` settings errors to `path-not-found` is pragmatic but may confuse users. Phase 1c should confirm this is acceptable or request a new error variant. |
| `Scanning` state caller precondition | 1c review | The spec declares `configure` during `Scanning` a caller precondition violation. If the UI can ever trigger ConfigureVault while the vault is scanning (e.g., settings accessible from the scan progress UI), a guard or distinct error is needed. |
| `VaultId.singleton()` source | 1c review | `ConfigureVaultPorts.vaultId` is injected rather than resolved from a Vault aggregate. This ensures testability but the injection site (Tauri command handler) must obtain it consistently. Confirm with AppStartup precedent. |

---

## Acceptance Gate (Phase 1c, lean)

- All fourteen PROPs above have a one-sentence verification plan stated in this document.
- Behavioral spec REQs (REQ-001 through REQ-014) are covered by PROPs (no orphan REQs).
- Adversary review (lean) checks for: missing error path coverage, inconsistent error-collapse rules, clock-budget violations.
- No human approval required (lean mode default).

# FIND-008: PROP-002 grep is trivially bypassable — the verification of "no TS-side VaultPath construction" is not adversarial-grade

- **id**: FIND-008
- **severity**: major
- **dimension**: verification_readiness

## citation
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:74` (PROP-002 description: "grep を CI に追加して残余の不正キャストを検出する")
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:190` (PROP-002 verification approach: "`grep -rn \"as VaultPath\\|as Brand.*VaultPath\" promptnotes/src/lib/ui/`")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:411-414` (NEG-REQ-005 ACs)

## referenceCitation
- `docs/domain/code/ts/src/shared/value-objects.ts:99-100` — `VaultPath = Brand<string, "VaultPath">` is a phantom-only brand. There is no runtime check; nothing prevents `JSON.parse(...) as unknown as VaultPath` or `Object.assign({}, raw) as VaultPath` from compiling.

## description
The verification approach for PROP-002 is a regex-grep for `as VaultPath` or `as Brand.*VaultPath`. Adversarial bypasses include:
1. `someValue as unknown as VaultPath` — splits across two `as` clauses; first regex matches, but a developer can also write `(<VaultPath>someValue)` (legacy TS angle-bracket syntax) which the regex does NOT match.
2. `someFn() as ReturnType<typeof vaultPath>` aliases.
3. Helper utility `function castToVaultPath<T>(x: T): VaultPath { return x as any; }` — the regex sees only `as any`, allowing widespread illegal construction through a single helper.
4. Re-export of a typed-but-untyped JSON: `import vaultData from './fixture.json' assert { type: 'json' };` then assigning to a `VaultPath`-typed slot — no `as` keyword at all.
5. Test fixtures that bypass the rule under `__tests__/` are explicitly within the grep scope (`promptnotes/src/lib/ui/`) but the spec doesn't say whether tests are in/out.

The trace table at `verification-architecture.md:155` claims NEG-REQ-001 through NEG-REQ-005 are covered by "型チェック + grep CI", but as shown above the grep does not adversarially defend the brand. Strict mode requires falsifiable PROPs.

## suggestedRemediation
Replace the grep with a TypeScript AST-level check (e.g. an ESLint rule or `ts-morph` script) that fails on any `TypeAssertion` or `AsExpression` whose target type is `VaultPath`, `Body`, `Tag`, `Frontmatter`, `NoteId`, or `VaultId`. Forbid `as any`, `as unknown as <Brand>`, and `<Brand>` angle-bracket assertions. Make this a Tier-0 lint rule rather than a regex grep. Specify whether `__tests__/` directories are in scope; if test fixtures need an escape hatch, gate it behind a single allow-listed helper file.

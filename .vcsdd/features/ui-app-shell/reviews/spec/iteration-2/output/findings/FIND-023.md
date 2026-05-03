# FIND-023: PROP-001b's "HMR re-mount" label tests in-process re-mount, not HMR — the title misleads Phase 2a

- **id**: FIND-023
- **severity**: minor
- **dimension**: verification_readiness

## citation
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:156-176` (PROP-001b: "AppStartup 呼び出し回数（HMR 二重マウント）" — the test mounts → unmounts → re-mounts using the same `render(AppShell, ...)` import)
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:163-176` (the test code for PROP-001b: it calls `render(AppShell, ...)`, then `unmount()`, then `render(AppShell, ...)` again, all within the same test execution context — i.e., the same module instance)
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:455-471` (PROP-012: this is the actual HMR test, using `vi.resetModules()` + dynamic `import()`)

## referenceCitation
- `.vcsdd/features/ui-app-shell/reviews/spec/iteration-1/output/findings/FIND-007.md:13-20` (the iteration-1 finding called for "mount → unmount → mount → spy still called only once" *for HMR re-mount semantics specifically*)

## description
PROP-001b is titled "AppStartup 呼び出し回数（HMR 二重マウント）" and the explanatory note at line 173 says "bootAttempted フラグにより 2 回目のマウントは invoke しない". But the test the Builder wrote does NOT exercise HMR. It exercises in-process unmount-and-re-mount within the same test: same module, same `bootFlag` instance, same `appShellStore` instance.

The two scenarios are behaviorally distinct:

| Scenario | Module instance | `bootFlag` value at 2nd mount | Expected behavior |
|----------|----------------|-------------------------------|-------------------|
| In-process re-mount (PROP-001b as written) | same | `true` (from 1st mount) | suppress 2nd invoke (REQ-001 AC) |
| HMR re-import (the scenario the title claims) | new (Vite re-imports the module) | `false` (fresh) | re-execute invoke_app_startup (REQ-021 line 510) |

PROP-001b's test pattern correctly verifies the in-process case: spy count = 1 after re-mount. But that is the BEHAVIOR OF `bootFlag`, not the behavior of HMR. The actual HMR scenario — where `bootFlag` is reset by module re-import and `invoke_app_startup` is re-executed — is verified separately by PROP-012 (line 455-471), which does use `vi.resetModules()`.

Two consequences:

1. **Phase 2a risk**: A test author reading PROP-001b's title plus its test code will write a test labeled "HMR re-mount" that actually validates in-process re-mount. When a real HMR-induced regression slips through (e.g., the Builder accidentally removes `vi.resetModules()` semantics from `bootFlag`), neither PROP-001b nor PROP-012 catches it because PROP-001b does not exercise the path and PROP-012 only checks the flag value, not the call-count consequence.

2. **Spec fidelity vs verification mismatch**: REQ-001 line 137 lists "HMR" as the rationale for `bootAttempted`. The verification artifact PROP-001b was added specifically to remediate iteration-1 FIND-007, which named "HMR re-mount" as the canonical scenario. But the test code falls short of that scenario.

This is a minor finding because the union of PROP-001b + PROP-012 does cover both aspects (in-process suppression + HMR reset), so the audit completeness is OK. But the misnaming creates downstream confusion and is exactly the kind of "partial / superficial resolution" the iteration-2 anti-leniency guidance flags.

## suggestedRemediation
Pick one:

(A) **Rename for accuracy**: rename PROP-001b from "AppStartup 呼び出し回数（HMR 二重マウント）" to "AppStartup 呼び出し回数（in-process 再マウント — bootFlag 抑制）". Add a one-line note that HMR re-import is verified separately by PROP-012, with cross-reference. Update the trace table at line 514-516 to reflect both PROPs covering REQ-001's two distinct ACs.

(B) **Add a third PROP-001c that genuinely tests HMR call-count**: 
```typescript
it('PROP-001c: HMR-reset bootFlag triggers a fresh invoke_app_startup', async () => {
  vi.resetModules();
  const { default: AppShell1 } = await import('../AppShell.svelte');
  const spy = vi.fn().mockResolvedValue({ ok: true, value: mockInitialUIState });
  render(AppShell1, { tauriAdapter: { invokeAppStartup: spy, ... } });
  await tick();
  vi.resetModules(); // Simulate Vite HMR
  const { default: AppShell2 } = await import('../AppShell.svelte');
  render(AppShell2, { tauriAdapter: { invokeAppStartup: spy, ... } });
  await tick();
  expect(spy).toHaveBeenCalledTimes(2); // HMR-reset means fresh invoke
});
```
This makes the post-HMR fresh-invoke behavior an explicit obligation alongside the in-process suppression.

Either suffices. Option (A) is cheaper; Option (B) is more thorough and aligns with REQ-021's "fresh boot" semantics.

## introducedIn
iteration-2-revision (PROP-001b is new in iteration-2; it was added to remediate iteration-1 FIND-007 but the label/scope mismatch is an iteration-2-introduced authoring defect)

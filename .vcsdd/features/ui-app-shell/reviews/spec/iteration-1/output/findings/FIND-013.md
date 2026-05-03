# FIND-013: Edge case enumeration is materially incomplete — symlinks, path-length, mid-string NUL, OS-picker race, network FS, settings-write race

- **id**: FIND-013
- **severity**: major
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:419-435` (Edge case catalog EC-01 through EC-13)
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:127-132` (REQ-004 edge cases — only empty, relative, NUL, picker-cancel, double-click)

## description
The strict-mode 1c checklist requires edge cases like "empty inputs, boundary values, concurrent access, error conditions". Material gaps:
1. **Symlink to a directory** — `try_new_vault_path` only checks empty/non-absolute. The `statDir` step in the dependency feature follows the symlink. There is no edge case for "user picks a symlink to outside their home directory" or "symlink that resolves to itself".
2. **OS_PATH_MAX overflow** — pathnames longer than the OS limit. No case covers this.
3. **Mid-string NUL byte** — EC-06 says "NUL byte path" maps to OS stat error → `path-not-found`, but only mentions NUL. Strings with embedded `\0` may be silently truncated by some Tauri serializers; the spec needs to commit to one behavior.
4. **OS folder picker returns a path the user does not have access to** — EC-07 covers cancel, but not "picker returned a path that the next IPC call to `try_vault_path` cannot stat" (e.g., user removed the drive between picker close and IPC).
5. **Network filesystem timeout** — `FsError.kind: 'unknown'` covers it via the dependency feature, but the UI behavior on a 30s hang is unspecified. Does the modal show a spinner forever? Is there a timeout? REQ-018's 100ms budget says nothing about pending-IPC.
6. **Settings.save fails after `try_vault_path` succeeds** — REQ-006's edge cases only mention `path-not-found` and `permission-denied` from `invoke_configure_vault`, but the dependency feature `configure-vault` REQ exposes `Settings.save`-level errors (`disk-full`, `lock`, `unknown`). The UI behavior for these is not specified.
7. **Concurrent double-mount AND in-flight `try_vault_path`** — EC-12 says the modal stays open across re-mount, but does not say what happens if `try_vault_path` was in flight during HMR.

## suggestedRemediation
Add explicit rows to the Edge case catalog for each of the seven items above. For the network-FS / hung-IPC case, decide on a UI policy (e.g. "after 5 s, show 'still working...' affordance; after 30 s, surface an error banner") and tie it to a new REQ.

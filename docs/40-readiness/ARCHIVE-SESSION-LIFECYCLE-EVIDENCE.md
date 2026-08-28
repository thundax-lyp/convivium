# Archive Session Lifecycle Evidence

## Scope

Commit boundary: `16ff36a` on `codex/feat/archive-session-lifecycle`.

This evidence covers the implemented archive package materialization, direct-child ownership proof, capability revoke → interrupt → drain → ownership close order, final archive transition, restart recovery dispatch, and terminal outbox dispatch guards.

## Validated Contract

- Archive facts are deep-copied from committed `MeetingState` facts and reject external facts.
- Cleanup targets exactly one Manager and every committed Participant; unknown, missing, duplicate, wrong-parent, or label-mismatched rows fail closed.
- Cleanup persists `revoked` before DSH effects. A fulfilled drain permits `closed`; durable children remaining listable are not treated as failure.
- `archived` requires every ownership row to be both `revoked` and `closed`.
- Restart recovery replays terminal archive begin with a termination-derived receipt. An archiving meeting without a bound Captain runtime remains pending and receives no DSH effect.
- A live `endMeeting` commits its terminal receipt first, then immediately invokes the same coordinator to advance the meeting to `archiving`; startup rehydrate provides the equivalent restart path.
- Speaker, Manager, and MeetingTask dispatch reject execution-terminal, `archiving`, and `archived` meetings before followup.

## Executed Validation

2026-08-28, macOS, Node `v22.23.2`, `@deepseek-ai/dsh-subagent@0.1.1-rc.2` declared and installed.

From `plugin/`:

- `pnpm verify` — passed.
  - Prettier, ESLint, host/client typecheck, build, package/environment/contract checks passed.
  - Vitest: 32 files, 227 tests passed.
- Focused archive/runtime checks previously passed in this commit boundary: `tests/unit/runtime/archive.spec.ts` and `tests/contract/meeting-runtime.spec.ts`.

## Not Covered

- A real DSH scratch-profile smoke is not executed: the repository has no profile/smoke harness or configured scratch profile. This evidence does not claim real host residency verification.

## Closure

Status: implementation closure evidence. Real DSH profile residency remains explicitly not covered; all verified lifecycle conclusions are retained in code, contract tests, and this evidence.

# Code Before Runtime Implementation Plan

> **For agentic workers:** Use executing-plans to implement inline, task by task.

**Goal:** Persist generated code before requesting an isolated runtime; retain resumable verification and honest preview status.

**Architecture:** Keep existing six stages and durable run/event/checkpoint storage. Make scaffold file-only, defer Git and dependency operations until verification, and retain the existing snapshot protection for old live-root previews. Display a distinct code-complete/verification-failed state using the persisted verify stage.

**Tech Stack:** TypeScript, Next.js, Node test runner, SQLite, existing native/Docker execution backends.

**Spec:** `docs/superpowers/specs/2026-11-15-code-before-runtime-design.md`

## Task 1: Remove early runtime dependencies

- [x] Add executable scaffold regression using a temporary template/workspace and runtime stubs that throw. Assert files and initialization marker exist, repeat scaffold preserves edits, non-platform directories remain protected, and no command/cache runtime probe occurs.
- [x] Add pipeline regression driving all stages with unavailable runtime; assert all pre-verify stages finish, no pre-verify Git runs, and failure is recorded at verify. Run `node --experimental-strip-types --test src/lib/generation/code-before-runtime.test.ts src/lib/generation/pipeline.test.ts` from app and observe failure.
- [x] Remove Git and dependency cache operations from scaffold; create `.atoms` before copying so interrupted copies can resume. Defer pipeline commit to verify success only, preserving old preview protection.
- [x] Rerun the focused regressions and require pass.

## Task 2: Runtime preparation and recoverable presentation

- [x] Add verification regression for runtime initialization exceptions: return failed StageResult with retained-code/retry guidance, do not attempt model repair or write a success report. Add cancellation case.
- [x] Add presentation regression for failed/interrupted/cancelled verify versus code-generation failure; only verify state can claim completed code.
- [x] At verify entry explicitly initialize runtime with cancellation before dependency work; log preparation and completion, return actionable failure. Keep shell execution isolated. Update summary/timeline copy and retry labels, using the same persisted failed verify stage and existing resume endpoint.
- [x] Add verify-only resume test; assert no discussion/scaffold/spec/plan/build reruns and successful completion commits once. Existing snapshot retention and runtime tests must pass.

## Task 3: Review and delivery

- [x] Run focused tests, full unit suite, `npm run typecheck`, `npm run lint`, and production build. Inspect failures and fix only scoped regressions.
- [x] Review old preview protection, artifact exports, stage-event restoration, cancellation, and no unisolated execution against design.
- [x] Update OpenSpec and deployment instructions, record exact verification results and distinguish local completion from server deployment.

## Execution ledger

- Initial: implementation authorized; existing `codex/one-prompt-app-delivery` workspace retained to keep changes visible in the user's current project. No deployment or server access is available.
- Ruling: retain snapshot protection when a legacy preview is executing mutable root sources; preserving an existing live service takes priority over avoiding all runtime work for this exceptional migration. New projects and already-pinned previews require no preparation before code generation.
- Pre-flight: scaffold and pipeline both trigger Git; both must change. Verify-only retries already load the saved plan and copy confirmed discussion answers; preserve this interface.

- Task 1: complete — scaffold/pipeline regressions observed failing, then passing; interrupted copy, user edits and verify-only resume covered.
- Task 2: complete — runtime exception/cancellation and UI restore regressions observed failing, then passing; both real components rendered with retained-code state.
- Task 3: complete — 267/267 tests pass, 0 skipped; typecheck/lint/production build pass; independent review reports no blockers. Local source only, server rollout remains external to this change.

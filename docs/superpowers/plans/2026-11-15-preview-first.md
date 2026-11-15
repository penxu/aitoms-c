# Preview First Implementation Plan

**Goal:** Produce usable code and an actual preview without optional acceptance blocking generation.

**Architecture:** Default preview/full policy in central config. Planning streams bounded JSON and validates executable code structure; preview verification requires a real HTTP homepage, with full browser acceptance retained as opt-in.

- [x] Add failing stage tests for malformed/missing acceptance, full-mode rejection, timeout/transport failure without duplicate retry, cancel, and partial/oversized JSON.
- [x] Implement streaming plan consumption and preview-only schema handling; align saved-plan resume validation and plan prompt.
- [x] Add failing HTTP preview and candidate-session tests; ensure no Chromium or business scripts run in preview mode, failed homepage never passes.
- [x] Add bounded same-origin homepage check; preserve actual build, isolated service startup and old-preview protection.
- [x] Verify report honesty, full-mode behavior, all tests, typecheck, lint and production build; document local/server distinction and sync specifications.

Ruling: user explicitly prioritizes preview and authorizes removing other blockers; this is the approval for the concrete preview-first scope. Keep code generation requirements and real service checks; make only automated business acceptance optional. The earlier hanging-plan diagnosis continues through the streaming and retry changes.

Completion: 286/286 unit tests pass (0 failed/cancelled/skipped); typecheck, lint and production build pass. Real SDK fixture and real local HTTP checks pass. Independent review found response-body false-positive; failing regressions added before fix, fix reviewed and all checks rerun successfully. Local changes only; no server update or task mutation performed.

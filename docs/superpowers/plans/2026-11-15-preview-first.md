# Preview First Implementation Plan

**Goal:** Produce usable code and an actual preview without optional acceptance blocking generation.

**Architecture:** Default preview/full policy in central config. Planning streams bounded JSON and validates executable code structure; preview verification requires a real HTTP homepage, with full browser acceptance retained as opt-in.

- [ ] Add failing stage tests for malformed/missing acceptance, full-mode rejection, timeout/transport failure without duplicate retry, cancel, and partial/oversized JSON.
- [ ] Implement streaming plan consumption and preview-only schema handling; align saved-plan resume validation and plan prompt.
- [ ] Add failing HTTP preview and candidate-session tests; ensure no Chromium or business scripts run in preview mode, failed homepage never passes.
- [ ] Add bounded same-origin homepage check; preserve actual build, isolated service startup and old-preview protection.
- [ ] Verify report honesty, full-mode behavior, all tests, typecheck, lint and production build; document local/server distinction and sync specifications.

Ruling: user explicitly prioritizes preview and authorizes removing other blockers; this is the approval for the concrete preview-first scope. Keep code generation requirements and real service checks; make only automated business acceptance optional. The earlier hanging-plan diagnosis continues through the streaming and retry changes.

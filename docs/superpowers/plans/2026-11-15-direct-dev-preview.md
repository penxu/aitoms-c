# Direct Dev Preview Implementation Plan

**Goal:** One managed dev process and immediate preview entry after listener readiness.
**Architecture:** TCP-only default readiness, no transient candidate HTTP checks, honest deferred validation report, bounded runtime log polling in existing UI. Full mode unchanged.

- [ ] Regressions first: listening socket without HTTP requests; default verify skips checkCandidate and health HTTP; no false health/homepage report.
- [ ] Implement TCP readiness and integrate runner with identity, cancellation and rollback preserved.
- [ ] Skip temporary default acceptance and report started/unverified status.
- [ ] Add bounded sanitized runtime logs to existing service polling and first-load UI.
- [ ] Regression suite, typecheck, lint, build, real controlled startup test and review.

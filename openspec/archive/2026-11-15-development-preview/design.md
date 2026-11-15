# Design

Reuse the existing preview/full policy. Preview verification retains dependencies, import/type checks and isolated candidate snapshots, then runs dev --webpack without production build. Candidate checks and runner use development environment and the existing base path. Ignore old production BUILD_ID when selecting default Next preview commands.

Chat/service refresh also skips production build and uses a fresh source candidate. Reports label production build skipped and dev readiness explicitly. Full continues production build/start plus browser acceptance; release publishing uses its unchanged production engine. Existing runtime gate, identity, rollback and shared-business-data protections remain.

The dev smoke test uses a self-contained fixture, checks real subpath page/JS/API, Chrome interaction and candidate HMR, verifies no production BUILD_ID, and cleans up its resources. See `docs/development-preview-results-2026-11-15.md` for evidence and server rollout limits.

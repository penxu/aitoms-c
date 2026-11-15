# Development Preview Implementation Plan

**Goal:** Default app previews run Next dev without production prerendering.

- [x] Add failing regressions for runner dev priority/environment, generation no-build, candidate mode, refresh no-build and honest report.
- [x] Implement consistent preview-mode selection across generator, candidate, runner and chat refresh; keep full/release production behavior.
- [x] Update chat instructions, status copy and verification reports.
- [x] Verify real dev service if available, full test suite, typecheck, lint and platform production build; review and sync specs.

Approval: user explicitly requests dev preview rather than production build; existing preview-first architecture and protections remain.

Complete: 290/290 unit tests pass (0 skipped/failed); typecheck, lint and platform production build pass. Real Next dev subpath HTML/JS/API and Chrome interaction/HMR pass with no production BUILD_ID. Independent read-only review found no blockers. No online upload, restart or project changes were performed.

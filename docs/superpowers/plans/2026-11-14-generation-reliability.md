# Generation Reliability Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent domains; root integrates and reviews.

**Goal:** 逐项修复 generation-engine-review-2026-11-14.md 的11类问题。
**Architecture:** 保留现有SQLite/Next流水线，独立模块提供语法转换、进程身份、命令隔离、任务租约、检查点与验收。用户已确认审查建议并授权连续实施。
**Tech Stack:** Next16、TypeScript compiler API、Node test、SQLite、Playwright。

1. Transform domain owns generation/{ui-contracts,next16-routes,next16-suspense,model-output}.ts and tests. Red tests: product variant remains premium, local params remains sync, fenced text inside source survives. Implement AST-scoped edits and exterior fence parsing. Run relevant node tests.
2. Runtime domain owns runner.ts and new workspace runtime modules/tests. Red tests: Promise.all start creates one child; restored process can be stopped only after identity match; stop/start races settle deterministically. Implement startup locks and identity persistence. No real user process termination during tests.
3. Execution domain owns workspace command/isolation/environment, dependency-cache/scaffold/toolchain and install_deps; root integrates helpers into VERIFY. Red tests: platform sentinel key excluded, sibling read/write denied in native isolation, package changes miss cache, tool chooses fixed pnpm. Verify native process and command cancellation.
4. Root owns generation pipeline/stages/prompts, chat and project mutation routes. Add lease conflicts (409), bounded calls and heartbeat, file checkpoints with plan/requirement/dependency/output hashes, contract-first context.
5. Root adds repair create/missing import context, no-progress fingerprint stop and independent candidate build; removes MINIMAL_PLAN success fallback and checks planned pages.
6. Root adds executable acceptance manifest and browser/API evidence, meaningful report statuses; real failure cannot be marked passed. Maintain pending status for requirements lacking executable assertions.
7. Root adds reusable UI tokens/components and application profiles; run browser at375/768/1440 against fixture/sample generated apps.
8. Run `npm run test:unit`, `npm run lint`, `npm run typecheck`, production build in separate output to avoid dev interference; fresh test projects only. Review all changes against the11 findings, document limits, keep user artifacts intact.

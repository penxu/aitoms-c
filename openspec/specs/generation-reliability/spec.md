# Generation Reliability

## Purpose
Keep generated applications recoverable and observable from a short requirement through preview, while preserving existing work and reporting only checks that actually ran.

## Requirements

### Requirement: Preview-first default
The platform SHALL default to code generation and technical preview verification, without requiring executable business acceptance, AC-ID coverage or Chromium. Complete business acceptance SHALL remain opt-in through full verification mode.

#### Scenario: Invalid optional acceptance
- **WHEN** a preview-mode plan contains missing or invalid acceptance but valid implementation structure
- **THEN** generation and saved-plan resume SHALL proceed without generating replacement plans solely for acceptance

#### Scenario: Browser unavailable
- **WHEN** the project builds and its isolated candidate homepage responds successfully but Chromium is unavailable
- **THEN** preview mode SHALL deliver a healthy preview and SHALL NOT claim browser or business verification

### Requirement: Observable bounded planning
The platform SHALL stream plan generation with effective first-response, inactivity and total timeouts, bounded output, explicit structural repair attempts and cancellation.

#### Scenario: Upstream failure
- **WHEN** a planning request fails due to transport, timeout or authentication
- **THEN** it SHALL fail recoverably without silently regenerating the entire plan or persisting partial output

### Requirement: Source generation precedes runtime preparation
The platform SHALL persist scaffold, specification, plan, and application code before initializing an execution backend for a new project. Runtime-dependent Git commits and dependency probing SHALL NOT block these stages.

#### Scenario: Runtime unavailable
- **WHEN** a new project's execution backend is unavailable
- **THEN** code generation SHALL complete and verification SHALL report its runtime failure without losing generated files or claiming a working preview

#### Scenario: Verification retry
- **WHEN** runtime access is restored after verification fails
- **THEN** the user SHALL be able to retry verification using persisted code, plan, and confirmed requirements without regenerating those artifacts

#### Scenario: Existing preview protection
- **WHEN** an existing preview uses mutable workspace sources
- **THEN** snapshot protection SHALL complete before modifying them; a failure SHALL preserve that preview and existing files

### Requirement: Safe transformations and resumable generation
The platform SHALL preserve valid business code, persist file checkpoints, bound model waits, and prevent conflicting writes.
#### Scenario: Resume after interruption
- **WHEN** an interrupted build is resumed with unchanged plan and dependencies
- **THEN** previously completed unchanged files SHALL be reused and changed files SHALL not be silently overwritten
### Requirement: Verified delivery
The platform SHALL reject incomplete plans, repair missing implementation files, and record actual browser/API checks independently from compilation.
#### Scenario: Missing required component
- **WHEN** an import points to an absent allowed source file
- **THEN** repair MAY create it, and no-progress retries SHALL terminate with an actionable failure
### Requirement: Isolated and unique runtimes
The platform SHALL start at most one preview per project, recover process identity, and keep platform credentials and other project files outside generated processes.
#### Scenario: Concurrent start
- **WHEN** two requests start the same project
- **THEN** they SHALL share one startup result and create one managed process

### Requirement: Preview matches verified work
The platform SHALL run the verified candidate artifact for a completed application and SHALL prepare a fresh candidate when the user explicitly applies newer workspace code.
#### Scenario: Restart after an edit
- **WHEN** a user edits workspace code and requests a restart
- **THEN** the new preview SHALL use that code, and a failed build SHALL leave the prior preview available

### Requirement: Acceptance attempts are independent
The platform SHALL isolate business acceptance data between checks and between repair attempts, preserve data across reloads within one check, and retain actual result evidence.
#### Scenario: Retry acceptance after repair
- **WHEN** a failed candidate is repaired and acceptance runs again
- **THEN** prior test records SHALL not affect the new attempt

### Requirement: Detached service recovery
The platform SHALL recognize an owned service that remains alive after its launcher exits and SHALL verify service ownership before restoring access or stopping it.
#### Scenario: Launcher exits before platform recovery
- **WHEN** the launcher has exited but its owned application service remains available
- **THEN** the platform SHALL restore preview access without targeting an unrelated process

### Requirement: Browser and API acceptance share user context
The platform SHALL execute browser/API checks with the same browser session and request interception semantics, and report the actual response when an assertion fails.
#### Scenario: Authenticated API validation
- **WHEN** a browser has completed login and an acceptance step calls a protected same-origin API
- **THEN** that request SHALL use the browser's authenticated session without weakening the application's authentication requirement
### Requirement: Observable asynchronous prerequisites
Generated acceptance flows SHALL wait for observable successful authentication before dependent navigation and SHALL use valid, unambiguous interaction targets and genuinely invalid input fixtures.
#### Scenario: Registration before booking
- **WHEN** a check registers a user and then creates a booking
- **THEN** it SHALL establish logged-in state before choosing an available slot and preserve the real booking assertions

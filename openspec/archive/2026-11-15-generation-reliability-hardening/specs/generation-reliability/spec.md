## Purpose
Keep generated applications recoverable and observable from a short requirement through preview, while preserving existing work and reporting only checks that actually ran.

## ADDED Requirements
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

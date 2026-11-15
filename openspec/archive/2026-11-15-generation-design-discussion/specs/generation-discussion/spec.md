## Purpose

Ensure ambiguous application requests become explicit, durable user decisions before code generation, while clear requests proceed without unnecessary interruptions.

## ADDED Requirements
### Requirement: Clarify consequential ambiguity before implementation
The platform SHALL assess a new application's requirement before writing scaffold or business files, ask only consequential unresolved questions, and proceed directly when sufficient information is available.
#### Scenario: Ambiguous application request
- **WHEN** a request has unresolved decisions that change the application's purpose or core workflow
- **THEN** generation SHALL pause with a public assessment, at most three questions, two to four options per question, recommended reasons, and free text answers
### Requirement: Durable user interruption
The platform SHALL persist discussions and answers in SQLite, release execution resources while waiting, and preserve pending questions across reloads and process restarts.
#### Scenario: Refresh while awaiting choices
- **WHEN** a user reloads a waiting task
- **THEN** the same discussion version SHALL be displayed without starting another generation or reporting a dead worker
### Requirement: Safe resume and explicit decisions
The platform SHALL validate answer versions transactionally, prevent duplicate resume and cancellation resurrection, and supply confirmed choices to downstream specification and code generation.
#### Scenario: Duplicate submission
- **WHEN** two clients submit the same discussion version
- **THEN** at most one continuation SHALL start and stale conflicting answers SHALL be rejected
### Requirement: Bounded discussion with user control
The platform SHALL provide keyboard accessible choices, custom answers, explicit recommended-answer acceptance, and cancellation, with at most two ordinary clarification rounds followed by explicit unresolved-assumption confirmation if needed.
#### Scenario: User accepts the shown recommendation
- **WHEN** the user explicitly chooses to use the displayed recommendations
- **THEN** the task SHALL continue with those choices recorded without another implicit approval

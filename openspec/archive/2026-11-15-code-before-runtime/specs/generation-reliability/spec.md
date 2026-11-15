## ADDED Requirements

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

## ADDED Requirements

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

## ADDED Requirements

### Requirement: Bounded observable preview checks
The platform SHALL impose independent hard deadlines on health and homepage requests, and SHALL NOT await response cancellation indefinitely. Temporary preview shutdown SHALL end tool waiting after a bounded forced-stop grace even if close is not emitted, preserving non-success flags and explicit termination uncertainty.

#### Scenario: Transport ignores cancellation
- **WHEN** a health or homepage request ignores its AbortSignal
- **THEN** its caller SHALL still finish at its deadline without reporting a successful response

#### Scenario: Temporary launcher never closes
- **WHEN** cancellation or timeout sends forced-stop signals but the launcher does not emit close
- **THEN** tool waiting SHALL finish with unconfirmed termination diagnostics, and candidate checks SHALL preserve that warning separately from the HTTP result

#### Scenario: Slow development compilation
- **WHEN** candidate startup or first-page compilation is in progress
- **THEN** the platform SHALL report the current step, elapsed time and bounded sanitized process output

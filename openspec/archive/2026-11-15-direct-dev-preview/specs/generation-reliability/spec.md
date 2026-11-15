## ADDED Requirements

### Requirement: Direct development preview startup
Default preview generation SHALL start one managed development service and return a preview entry when its loopback listener is reachable. It SHALL NOT start temporary acceptance services or send preparatory homepage/health HTTP requests. First browser access MAY trigger compilation; listener readiness SHALL NOT be reported as proven homepage or business success.

#### Scenario: Slow first compilation
- **WHEN** the development listener is available but the homepage has not compiled
- **THEN** preview entry SHALL be returned, the UI SHALL show first-load preparation, and bounded sanitized process logs SHALL remain available including after a later process crash

#### Scenario: Start or replacement fails
- **WHEN** an owned development process fails before listening
- **THEN** startup SHALL report actual diagnostics, retain process identity and cancellation protections, and preserve the existing rollback behavior

#### Scenario: Explicit full verification
- **WHEN** full verification is selected
- **THEN** production build, temporary isolated checks and real HTTP readiness SHALL remain enabled

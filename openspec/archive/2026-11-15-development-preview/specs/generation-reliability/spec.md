## ADDED Requirements

### Requirement: Development preview without production build
Default preview mode SHALL start generated applications in development mode without requiring a production build. Candidate checks, chat/service refresh and final preview SHALL use the same mode, even when an old production BUILD_ID exists.

#### Scenario: Production prerendering fails
- **WHEN** an application can run in dev but cannot pass production prerendering
- **THEN** default preview SHALL still be allowed after its actual service and homepage checks pass, and SHALL NOT report a production build as passed

#### Scenario: Explicit production verification or publishing
- **WHEN** full verification or a production release is requested
- **THEN** the production build and production service requirements SHALL remain in effect

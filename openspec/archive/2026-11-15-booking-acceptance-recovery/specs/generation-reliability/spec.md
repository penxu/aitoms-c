## ADDED Requirements
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

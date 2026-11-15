## ADDED Requirements
### Requirement: Responsive single-page generated applications
Default generation SHALL organize ordinary create, edit, detail and list operations inside one workspace, preserving real API persistence and unsaved-change protection. Heavy editors SHALL load on demand without entering the initial bundle. Necessary independent routes SHALL expose immediate pending feedback.
#### Scenario: Open a lightweight create form
- **WHEN** a user opens a create action
- **THEN** its same-page form SHALL become visible without waiting for another server page response
#### Scenario: Existing room application migration
- **WHEN** the authorized room application is migrated
- **THEN** existing data and APIs SHALL remain compatible, hash reload/back navigation SHALL preserve intended views, all projects SHALL remain reachable, and asynchronous create completion SHALL NOT silently discard unsaved edits

### Requirement: Same-origin preview HMR proxy
The preview WebSocket proxy SHALL validate the incoming Origin against Host before mapping the request to loopback identity, preserving handshake headers and rejecting foreign origins.
#### Scenario: Public preview origin
- **WHEN** an owned preview WebSocket arrives from its own public origin
- **THEN** its upstream request SHALL carry the matching loopback Host, Origin and forwarded identity
#### Scenario: Cross-origin WebSocket
- **WHEN** a third-party origin attempts an upgrade
- **THEN** the platform SHALL reject it before forwarding to the preview

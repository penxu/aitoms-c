## ADDED Requirements
### Requirement: Live workspace development preview
Default preview SHALL run project-root source directly, reuse successfully installed dependencies and an owned root development service, and install only when dependency inputs/runtime no longer match. Explicit restart or changed dependencies SHALL restart the root service. Default source edits and generation SHALL NOT create baseline candidate copies. Full verification and production release SHALL retain independent snapshot workflows.
#### Scenario: Repeat open or start
- **WHEN** an unchanged project already has an owned root dev service
- **THEN** the platform SHALL reuse it without copying source or dependencies, running installation, or allocating another port
#### Scenario: Edit running source
- **WHEN** source files are saved in default preview mode
- **THEN** writes SHALL reach the project root immediately for HMR without snapshot preparation, while retaining mutation and path safety
#### Scenario: Old candidate or changed dependencies
- **WHEN** a legacy candidate is running or root dependencies have changed
- **THEN** the next successful run SHALL use current root source and updated dependencies
#### Scenario: Preparation failure
- **WHEN** dependency preparation fails or is cancelled
- **THEN** no replacement service SHALL be started and no preview success SHALL be reported

## MODIFIED Requirements
### Requirement: Source generation precedes runtime preparation
The platform SHALL persist scaffold, specification, plan, and application code before initializing an execution backend for a new project. Runtime-dependent Git commits and dependency probing SHALL NOT block these stages.

#### Scenario: Runtime unavailable
- **WHEN** a new project's execution backend is unavailable
- **THEN** code generation SHALL complete and verification SHALL report its runtime failure without losing generated files or claiming a working preview

#### Scenario: Verification retry
- **WHEN** runtime access is restored after verification fails
- **THEN** the user SHALL be able to retry verification using persisted code, plan, and confirmed requirements without regenerating those artifacts

#### Scenario: Existing preview protection
- **WHEN** full verification modifies sources used by an existing preview
- **THEN** snapshot protection SHALL complete before modifying them; a failure SHALL preserve that preview and existing files

#### Scenario: Default development edits
- **WHEN** default preview mode modifies project sources
- **THEN** edits SHALL use the live workspace without baseline snapshots, allowing the dev server to display source errors and recover after correction

### Requirement: Preview matches verified work
Full verification SHALL run the verified candidate artifact for a completed application. Default development preview SHALL run current project-root sources and reuse an owned service only when its startup dependency fingerprint matches the current dependencies. Cross-directory replacement failure SHALL restore the previous preview unless explicitly cancelled.
#### Scenario: Restart after an edit
- **WHEN** a user edits workspace code and requests a development restart
- **THEN** the new preview SHALL run root source without preparing a candidate copy
#### Scenario: Independent dependency installation
- **WHEN** a separate dependency-install tool completes before a later start request
- **THEN** the runtime SHALL compare its persisted startup dependency fingerprint and restart when it no longer matches
#### Scenario: Cancel during startup
- **WHEN** the caller cancels while a new development service is starting
- **THEN** the runtime SHALL stop the new startup and SHALL NOT leave an unreported owned service running

# Generation Reliability

## Purpose
Keep generated applications recoverable and observable from a short requirement through preview, while preserving existing work and reporting only checks that actually ran.

## Requirements

### Requirement: Development preview without production build
Default preview mode SHALL start generated applications in development mode without requiring a production build. Candidate checks, chat/service refresh and final preview SHALL use the same mode, even when an old production BUILD_ID exists.

#### Scenario: Production prerendering fails
- **WHEN** an application can run in dev but cannot pass production prerendering
- **THEN** default preview SHALL still be allowed after its actual service and homepage checks pass, and SHALL NOT report a production build as passed

#### Scenario: Explicit production verification or publishing
- **WHEN** full verification or a production release is requested
- **THEN** the production build and production service requirements SHALL remain in effect

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

### Requirement: Observable reusable dependency installation
The platform SHALL reuse a complete installed dependency tree only when its successful-install fingerprint matches the manifest, lockfile, execution runtime and platform toolchain. It SHALL retain isolated physical copies for candidates and run installation for explicit additions or incomplete/incompatible trees.

#### Scenario: Copy a verified candidate
- **WHEN** installed dependencies are copied into a fresh candidate with unchanged inputs and runtime
- **THEN** preparation SHALL reuse them without invoking pnpm to recreate node_modules

#### Scenario: Cold or changed installation
- **WHEN** installation must execute
- **THEN** the platform SHALL report progress before completion, retain the bounded error tail, honor cancellation and process deadlines, and use a validated configurable registry with bounded fetch retries

#### Scenario: Preliminary chat output
- **WHEN** the installer emits progress through preliminary tool results
- **THEN** the UI SHALL show installation as active until a final result arrives

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

### Requirement: Homepage timeout preserves source for diagnosis
The platform SHALL NOT infer a source defect solely from a PREVIEW-HOME response timeout or automatically rewrite application code for that timeout. It SHALL preserve bounded sanitized service output, report that homepage verification is incomplete, and allow an explicit verification retry.

#### Scenario: Slow first page response
- **WHEN** the homepage request reaches its deadline after health has succeeded
- **THEN** verification SHALL stop without entering model repair or publishing a success report, while retaining diagnostics and source

#### Scenario: Concrete source failure
- **WHEN** a homepage returns HTTP500 or compilation/type diagnostics establish a code failure
- **THEN** the ordinary repair policy SHALL remain available

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

### Requirement: Bounded disposable project artifacts
Project preparation and successful preview replacement SHALL reclaim obsolete candidate dependency/build directories while preserving all runtime, recovery and rollback sources. Candidate dependency copies SHALL NOT share writable hardlink inodes. Failed preparation SHALL remove only its newly owned candidate when ownership and canonical path can be confirmed.

#### Scenario: Repeated preview attempts
- **WHEN** candidates are prepared or a preview replacement succeeds
- **THEN** unprotected obsolete candidates SHALL be reclaimed instead of accumulating full dependency trees

#### Scenario: Successful dependency installation
- **WHEN** installation succeeds or a verified installed fingerprint is reused
- **THEN** the independent per-project download store MAY be reclaimed, preserving installed modules, source, data, HOME and TMP

#### Scenario: Background cache cleanup
- **WHEN** startup maintenance scans projects
- **THEN** it SHALL obtain the project mutation lease, reject symlinked cache paths, preserve runtime TMP/store for protected services and skip busy projects

### Requirement: Reusable fixed-template dependencies before installation
The platform SHALL prepare fixed-template dependencies in a controlled independent temporary project inaccessible to running user applications and publish a complete cache keyed by the trusted manifest, package manager, registry and execution runtime. Matching projects without a lockfile SHALL reuse its lockfile and installed tree without invoking another installation. Changed dependencies, scripts, unsupported configuration or a conflicting lockfile SHALL use independent installation.

#### Scenario: Second template project
- **WHEN** a complete cache exists for a matching template and runtime
- **THEN** dependencies and the template lockfile SHALL be restored without running pnpm

#### Scenario: Independent writes
- **WHEN** dependency trees are restored or copied
- **THEN** files SHALL have independent writable inodes, using copy-on-write storage when supported and ordinary copies otherwise, and cache removal SHALL NOT invalidate restored projects

#### Scenario: Interrupted or corrupt preparation
- **WHEN** preparation fails, is cancelled, or encounters a broken or escaping cache tree
- **THEN** it SHALL NOT publish partial results, claim successful reuse, or weaken project path validation

#### Scenario: Responsive cache operations
- **WHEN** a large dependency cache is inspected, published or restored
- **THEN** filesystem traversal and copying SHALL be asynchronous so platform requests can continue

#### Scenario: Corrupt cache recovery
- **WHEN** cached contents, links, permissions or the lockfile fail full integrity validation
- **THEN** the cache SHALL be isolated and rebuilt before reporting successful reuse

#### Scenario: Cold installation fails
- **WHEN** the controlled template installation fails or times out
- **THEN** its actual failure SHALL be returned without automatically starting a second identical installation

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

## ADDED Requirements
### Requirement: Read-only shared template runtime dependencies
Compatible fixed-template projects on Linux namespace isolation or Docker SHALL mount one platform-prepared immutable dependency tree read-only at their project-local node_modules path. Trusted bindings SHALL be stored outside user workspaces in SQLite and validated against source inputs, runtime and cache identity. File-tool path boundaries SHALL remain unchanged. Customized dependencies and unsupported native platforms SHALL use independent installation.
#### Scenario: Second compatible project
- **WHEN** another matching project starts after a shared cache is prepared
- **THEN** it SHALL use the same read-only dependency tree without reinstalling or copying that tree into the project
#### Scenario: Dependency write or forged binding
- **WHEN** generated code attempts to modify shared dependencies or supplies its own cache path
- **THEN** shared contents SHALL remain protected and untrusted paths SHALL NOT be mounted
#### Scenario: Existing project transition
- **WHEN** an existing compatible project switches to shared dependencies
- **THEN** its old dependency contents SHALL remain until the previous service has stopped and replacement has started successfully, then be reclaimed without removing source, data or compilation caches
#### Scenario: Warm validation
- **WHEN** an immutable cache has already passed full validation in the current platform process
- **THEN** subsequent reuse SHALL validate its trusted identity without rehashing or copying its entire tree

## MODIFIED Requirements
### Requirement: Reusable fixed-template dependencies before installation
The platform SHALL prepare fixed-template dependencies in a controlled independent temporary project inaccessible to running user applications and publish a complete cache keyed by the trusted manifest, package manager, registry and execution runtime. Matching projects SHALL reuse its compatible lockfile and installed tree without invoking another installation; supported namespace runtimes MAY mount immutable shared dependencies read-only instead of restoring a physical copy. Changed dependencies, scripts, unsupported configuration or a conflicting lockfile SHALL use independent installation.

#### Scenario: Second template project
- **WHEN** a complete cache exists for a matching template and runtime
- **THEN** dependencies and the template lockfile SHALL be reused without running pnpm, by a read-only shared mount on supported runtimes or an independent copy otherwise

#### Scenario: Independent writes
- **WHEN** dependency trees are restored or copied
- **THEN** independent writable copies SHALL use independent inodes, using copy-on-write storage when supported and ordinary copies otherwise; shared mode SHALL instead expose immutable dependency files through a read-only mount and retain published caches while services may use them

#### Scenario: Interrupted or corrupt preparation
- **WHEN** preparation fails, is cancelled, or encounters a broken or escaping cache tree
- **THEN** it SHALL NOT publish partial results, claim successful reuse, or weaken project path validation

#### Scenario: Responsive cache operations
- **WHEN** a large dependency cache is inspected, published or restored
- **THEN** filesystem traversal and copying SHALL be asynchronous so platform requests can continue

#### Scenario: Corrupt cache recovery
- **WHEN** cached contents, links, permissions or the lockfile fail full integrity validation
- **THEN** independent-copy caches SHALL be isolated and rebuilt before reporting successful reuse; published shared caches SHALL NOT be mutated or removed while services may use them, and affected preparations SHALL fall back to independent installation without claiming shared reuse

#### Scenario: Cold installation fails
- **WHEN** the controlled template installation fails or times out
- **THEN** its actual failure SHALL be returned without automatically starting a second identical installation

### Requirement: Observable reusable dependency installation
The platform SHALL reuse a complete installed dependency tree only when its successful-install fingerprint matches the manifest, lockfile, execution runtime and platform toolchain. It SHALL retain isolated source and data for candidates. Dependencies SHALL use independent physical copies or authenticated immutable read-only template mounts; explicit additions or incomplete/incompatible trees SHALL run independent installation.

#### Scenario: Copy a verified candidate
- **WHEN** installed dependencies are copied into a fresh candidate with unchanged inputs and runtime
- **THEN** preparation SHALL reuse them without invoking pnpm to recreate node_modules

#### Scenario: Cold or changed installation
- **WHEN** installation must execute
- **THEN** the platform SHALL report progress before completion, retain the bounded error tail, honor cancellation and process deadlines, and use a validated configurable registry with bounded fetch retries

#### Scenario: Preliminary chat output
- **WHEN** the installer emits progress through preliminary tool results
- **THEN** the UI SHALL show installation as active until a final result arrives

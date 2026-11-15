## ADDED Requirements
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

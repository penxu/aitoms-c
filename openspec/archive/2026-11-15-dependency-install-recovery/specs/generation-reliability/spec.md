## ADDED Requirements

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

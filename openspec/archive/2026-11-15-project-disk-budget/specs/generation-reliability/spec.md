## ADDED Requirements

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

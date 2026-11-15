## ADDED Requirements

### Requirement: Homepage timeout preserves source for diagnosis
The platform SHALL NOT infer a source defect solely from a PREVIEW-HOME response timeout or automatically rewrite application code for that timeout. It SHALL preserve bounded sanitized service output, report that homepage verification is incomplete, and allow an explicit verification retry.

#### Scenario: Slow first page response
- **WHEN** the homepage request reaches its deadline after health has succeeded
- **THEN** verification SHALL stop without entering model repair or publishing a success report, while retaining diagnostics and source

#### Scenario: Concrete source failure
- **WHEN** a homepage returns HTTP500 or compilation/type diagnostics establish a code failure
- **THEN** the ordinary repair policy SHALL remain available

## ADDED Requirements
### Requirement: Credential header preflight
The platform SHALL reject invalid model credential header values before invoking the model and SHALL identify the configuration variable without disclosing its value.
#### Scenario: Non-ASCII credential placeholder
- **WHEN** a model credential contains Chinese placeholder text or an embedded control character
- **THEN** generation SHALL return an actionable configuration error without creating an application or attempting to encode the invalid credential
### Requirement: Recovery preserves application intent
The platform SHALL retain the original requirement and confirmed decisions when recovering a failed generation, and SHALL direct early failures to explicit generation retry rather than interpreting diagnostic text as a replacement application.
#### Scenario: Failure before specification exists
- **WHEN** a user sends a diagnostic message after generation failed before writing its specification
- **THEN** the platform SHALL preserve the original task and offer its retry path without initializing an unrelated scaffold
### Requirement: Trusted runtime configuration
The platform SHALL separate Docker control-plane connection configuration from generated application environments and SHALL diagnose unavailable runtime access without silently reducing isolation.
#### Scenario: Panel process inherits another user's home
- **WHEN** the platform runs under a non-root UID with an inherited root HOME
- **THEN** Docker CLI SHALL use the actual user's home unless explicitly configured and generated commands SHALL not inherit Docker connection credentials

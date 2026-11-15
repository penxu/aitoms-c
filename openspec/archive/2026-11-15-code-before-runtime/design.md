# Design

Use the existing stages and durable checkpoints. Remove all Git and dependency-cache/runtime work from scaffold and pre-verification stage completion. Mark the project directory before copying template files so interrupted preparation can resume safely.

Initialize the execution runtime explicitly at verify entry, respect cancellation, and return an actionable verification failure without model repair when initialization fails. Preserve existing install/build/preview/acceptance isolation and snapshot protection for a legacy mutable-root preview. Commit Git only after successful verification.

Use the persisted verify stage to distinguish completed source from incomplete runtime verification. Both progress surfaces offer verify-only retry and recover earlier stage completion after refresh or a new verification run. Source download remains available independently of a running service.

See `docs/superpowers/specs/2026-11-15-code-before-runtime-design.md` and `docs/code-before-runtime-results-2026-11-15.md` for approved scope, exceptions, checks, and server rollout limits.

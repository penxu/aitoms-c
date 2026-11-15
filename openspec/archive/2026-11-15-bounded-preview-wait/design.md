# Design

Keep preview validation semantics: isolated test database, real health/HTML responses, full acceptance in explicit full mode, and rollback through the existing runner. Do not skip validation or report successful shutdown without evidence.

Health probes use the shared hard deadline helper with the smaller of five seconds and remaining total time. Response cancellation is started without waiting for it to finish. Home response headers use the same hard deadline helper already used for body reading, preserving the outer total deadline across redirects.

Command cancellation first sends SIGTERM, then SIGKILL after three seconds. Timeouts send SIGKILL. After SIGKILL, allow one second for close; if no close arrives, destroy local pipes, unref the launcher and return a non-success result with terminationUnconfirmed:true and an explicit warning. This bounds the caller wait, not a guarantee that every descendant has stopped. Retain execution cleanup attempts; cleanup exceptions become diagnostics instead of leaving promises unresolved. Candidate checks log teardown uncertainty even if the real homepage had passed.

Candidate progress includes startup port, health wait, first-page compilation, live sanitized/throttled child output, ten-second heartbeats and teardown completion. This identifies which operation is slow without changing isolation or user business code. Timers rely on a responsive Node event loop; server resource starvation must be checked separately.

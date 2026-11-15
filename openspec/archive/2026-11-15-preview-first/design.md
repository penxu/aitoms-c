# Design

Central configuration selects preview (default) or full. Preview planning omits executable acceptance and validates only actual code structure/requirements. Existing plans are loaded without their optional acceptance scripts in preview mode.

Planning streams text with public progress counts, bounded output and explicit error/abort handling. The initial-response deadline includes waiting for HTTP headers; SDK timeouts cover stream inactivity and total generation; final metadata has an independent bound. Only JSON/implementation structure errors can trigger one correction attempt.

Preview verification retains isolated dependency installation, typecheck, production build and candidate service health. It checks a same-app HTML homepage via HTTP with bounded redirects, total time and complete response size, without Chromium or business automation. Full preserves browser/AC checks. Reports distinguish technical success from business verification; existing previews remain protected.

See approved scope in `docs/superpowers/specs/2026-11-15-preview-first-design.md` and evidence in `docs/preview-first-results-2026-11-15.md`.

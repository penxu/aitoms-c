# Design

Recognize only the existing PREVIEW-HOME homepage timeout error, using infrastructureFailure as the existing no-repair routing boundary. The message describes an unknown cause, retained sources, unverified homepage and actionable diagnostic/retry step. Do not classify HTTP500, type errors or arbitrary acceptance failures as operational timeouts.

Capture bounded sanitized live server output in failed homepage check results before teardown overwrites output. Preserve existing process/data isolation and cleanup. Verification integration tests ensure a single candidate attempt, no automatic repair entry and no successful verification report on timeout.

Online read-only source review found a synchronous bounded recent-records SQLite query with no remote request in the homepage, local system fonts and no remote stylesheet import in the inspected files. That narrows investigation but does not establish CPU/memory load or why webpack/rendering exceeded its deadline. No online mutations are performed.

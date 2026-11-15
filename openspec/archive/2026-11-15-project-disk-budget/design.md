# Design

Installed dependencies remain separate physical/reflink copies with immutable successful-install fingerprints. Candidate preparation prunes stale candidates under the caller's mutation lock before allocating another full dependency copy, preserving runner-owned sources. Failure removes only the newly allocated candidate after canonical path checks. After successful runner replacement prune again; failure to reclaim caches is logged and does not invalidate a working preview.

pnpm uses package-import-method=copy. Its per-project .atoms/runtime/pnpm-store is disposable after successful installation or fingerprint reuse. A new cleanup helper deletes only that exact canonical ordinary directory and rejects symlinked path components, retaining source, installed packages, data, HOME and TMP. Failures are nonfatal progress warnings. Future missing dependencies may need redownload; compatible installed copies and template caches remain reusable.

Deployment does not imply deleting remote files in this chat. Existing on-disk usage is reduced on next guarded project preparation/reuse; a maintenance entry should use the same mutation and runtime protection rules. Startup cleanup must not assume surviving managed services are stopped.

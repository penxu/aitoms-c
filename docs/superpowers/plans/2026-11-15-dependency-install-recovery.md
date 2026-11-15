# Dependency Install Recovery

**Goal:** Stop reinstalling copied verified dependencies and expose useful install progress/errors.

Evidence: previous online project chat start_service failed while pnpm printed `Recreating .../.atoms/candidates/.../node_modules`. The code copies node_modules then installs against a new per-candidate store path. The current supplied project p_mwhj1gw21l9sdn independently confirms candidate recreation, 58 downloads, and node-gyp failing to locate Python. Native system header/library read mounts were also incomplete and are now included.

- [x] Regressions first: matching copied dependency marker skips install; changed manifest/runtime or missing direct package invalidates it; process output arrives before completion and retains error tail.
- [x] Reuse only matching package+lock+runtime+toolchain fingerprints and coherent dependency trees, never accept manifest existence alone. Explicit add requests still install.
- [x] Make package registry configurable and validate/shell-quote it. Keep existing registry default. Add bounded network retry/timeouts and append-only output.
- [x] Stream bounded install status through generation logs and chat preliminary tool results, report cache/copy/install steps distinctly, preserve cancellation.
- [x] Verify unit suite, actual isolated install behavior, typecheck, lint and build; document local versus online limitations.

No online files, users, permissions or processes will be modified. Dependency scripts remain isolated. No shared writable dependency store is introduced.

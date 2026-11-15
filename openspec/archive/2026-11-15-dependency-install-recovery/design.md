# Design

A successful isolated install writes a marker of the manifest, pnpm lockfile, execution runtime and fixed platform pnpm toolchain. Before installing, validate that fingerprint, the direct packages and regular pnpm command shims. An exact candidate copy can then skip pnpm entirely, avoiding the new candidate store path triggering recreation. Missing, stale or incompatible installations and explicit package additions still run the installer.

Keep separate physical dependency copies and execution isolation. Do not use hardlinks or share writable tenant stores. Registry changes affect future installs, not already verified installed packages. Validate registry URLs and shell quote the command argument. Bound each fetch to 30 seconds and one retry; the existing five-minute process deadline remains.

Command output is delivered during execution and retained as a bounded tail. Chat install tools emit SDK preliminary results with `installing: true` plus elapsed time, then a final result; UI must not show success for a preliminary value. Cancellation of consumption aborts installation. Generation and candidate preparation publish progress through existing events. Log output redacts common credentials. These changes diagnose silent downloads/native compilation, but do not remove network or compiler requirements.

The supplied live project subsequently confirmed candidate recreation followed by node-gyp Python discovery failure. Native Linux execution now also read-only mounts system /usr/lib64 and header directories; it does not inherit root Conda environments. Installing system Python/make/C++ and verifying them on the target host remains operational work. Chat start/restart forwards the same bounded progress stream, including fallback candidate installs.

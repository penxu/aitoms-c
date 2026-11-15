# Dependency install recovery

Verified dependencies copied into a candidate are currently installed again against a different store path, causing pnpm to recreate them. Installation logs are buffered until completion and registry is hardcoded, making network/native build waits hard to diagnose.

Reuse coherent fingerprinted installations, provide explicit progress and bounded network waits, configurable registry, and retain final error tails. Keep isolation, explicit package additions, runtime compatibility and cancellation.

Current online project p_mwhj1gw21l9sdn confirms the recreated candidate redownloaded 58 packages then failed building better-sqlite3 because node-gyp could not find Python. Complete readonly system compiler/library mounts and document host prerequisites.

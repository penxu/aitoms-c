# Bound per-project disk growth

User reports 4.3GB candidates and 1.5GB runtime in one project. Repeated independent dependency snapshots, persistent pnpm download stores and failed candidate leftovers amplify disk usage. Keep only one recent unprotected candidate plus all active/recovery/rollback sources, reclaim independent download stores after successful installation, and clean failed preparations. Preserve package copies using reflink-or-copy, not shared writable hardlinks, so repairs cannot corrupt the running preview. Do not delete project source, business data or active Next caches.

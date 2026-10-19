# Production data safety

These rules apply to every change in this repository.

- Never push to the production branch or deploy to production without the user's explicit approval in the current conversation.
- Before every production deployment, create a complete timestamped backup of all production accounts and all data sources, including `studio_data`, profiles, public tokens and portal snapshots, store snapshots, reviews, notifications, subscriptions, and storage/file metadata.
- Verify that the backup is readable and record its row counts before asking for deployment approval. If backup or verification fails, stop and do not deploy.
- Never seed, replace, bulk-upsert, clear, migrate, or restore production data without separate explicit approval that describes the exact affected accounts and collections.
- Never replace a non-empty account snapshot with an empty or materially smaller snapshot. Treat an unexpected large record-count drop as a blocked write requiring manual review.
- Prefer additive, backward-compatible migrations. Do not remove or rename stored fields until existing production data has been backed up and migrated successfully.
- Test persistence, account isolation, public portals, stores, and rollback behavior before requesting deployment approval.
- A prior approval does not authorize a later deployment or database write. Ask again after presenting the backup and verification summary.

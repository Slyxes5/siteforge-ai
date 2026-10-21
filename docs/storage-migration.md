# Browser storage and future backend migration strategy

## Current M2A behavior

Canonical Project Schema v1 is persisted at `siteforge:project:v1:<exact-project-id>`. Existing keys remain unchanged. The library enumerates this prefix directly rather than maintaining a separately persisted index. Unrelated localStorage keys are ignored. Corrupt records, unknown versions and key/document-ID mismatches are reported without deletion or repair.

New generated projects use `crypto.randomUUID()`, start at revision 0, and are inserted only if the raw destination key is absent. Standard import preserves the document ID/revision and rejects a conflict. Explicit import-as-copy preserves blocks, description, name and provenance, assigns a fresh ID and starts revision 0. Rename increments revision and preserves website content. Confirmed deletion removes only the selected exact snapshot. If its ID is active, a new blank, unsaved draft uses a different ID.

No data is auto-migrated or rewritten at startup, listing, opening or JSON validation. Template updates never regenerate an existing document. Export is an explicit download of the current validated draft; it does not write storage or clear dirty status. Import has a 4 MiB input safety cap. Export can contain a larger schema-valid document, but such a file is intentionally outside the current importer limit; it is still a data backup, not a promise that large files can be reimported in this milestone.

## Limitations users must understand

- **Origin-specific:** scheme, host and port matter. `http://127.0.0.1:5178`, `http://localhost:5178` and port 5189 have independent stores. Use JSON export/import to move projects deliberately.
- **Browser/profile/device-specific:** a separate Chrome profile or another device will not contain the same data.
- **Not a backup:** clearing site data, storage eviction, profile removal or private browsing can remove records. Keep JSON copies of valuable projects outside browser storage.
- **Finite quota:** browser/device policies vary. More projects and long content compete for the same origin quota. Quota/security/write failures are surfaced; failed drafts remain in the current tab. No universal project-count guarantee is made.
- **No autosave/draft recovery:** unsaved edits are lost if the browser discards the tab or crashes. Beforeunload/confirmation are best-effort warnings, not durable recovery.
- **Not transactional across tabs:** stale snapshots and revision conflicts are rejected, but read/check/write and read/check/delete are not atomic. A narrow simultaneous race remains possible. M2A is not collaborative editing.
- **Not encrypted or an access-control boundary:** other same-origin code can access localStorage. Never store API credentials in project documents.
- **Confirmed deletion is permanent:** there is no trash or undo for saved-project deletion. Export first when a copy may be needed.
- **Backward reader compatibility only:** M2A reads M0/M1 unchanged. Older strict app versions may reject optional M2A metadata or newer block variants. A source-code snapshot is not a browser-data backup or a schema downgrade tool.

## Future migration plan — proposal, not implementation

1. Keep the canonical versioned schema and adapter boundary. Define a repository interface with `list/get/create/update/delete`, explicit expected revision/ETag, and consistent validation errors. A future backend replaces persistence, not the Puck-owned data format.
2. Add a user-triggered migration preview that enumerates each source record, reports malformed/unsupported items, and generates validated JSON backups plus a manifest. Never erase unknown records to make migration pass.
3. Preserve the exact source ID, schema version, revision and provenance. Resolve destination conflicts explicitly: skip, import-as-copy with an ID map, or a separately approved replacement workflow. No silent overwrite or auto-merge.
4. Use server-side validation, unique ID constraints and transactional compare-and-swap/ETag checks. Add idempotency tokens for retries and transactional metadata/index writes. Choose and approve any future authentication/authorization separately before remote multi-user storage.
5. Copy one project at a time, read back the exact destination and compare canonical content. Record per-project success/failure and allow safe resume without duplicate creation. Mixed failures must leave all source documents intact.
6. Keep the browser source and external JSON backups until the user confirms all destination projects open, edit, save and export correctly. Source cleanup is an independent, explicit, narrowly scoped approval—never part of an automatic destructive migration.
7. Test interrupted writes, exhausted quotas, network failures, duplicate retries, stale revisions, schema upgrades/downgrades and rollback. Prefer soft deletion/recovery in the future service before offering permanent deletion.

No backend, database, authentication, external API or paid infrastructure is installed or enabled by this plan. M2B/M3 remain unapproved.

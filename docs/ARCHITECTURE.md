# Offline-first architecture (local SQLite is the authority)

This application is an Electron + React desktop POS. All operational data is stored in SQLite in the Electron user-data directory. There is **no Supabase client and no internet requirement** for login, POS, kitchen, inventory, reports, or backup.

## Process boundaries

- **Main process**: SQLite, migrations, repositories, business rules, IPC authorization.
- **Preload**: `contextBridge` whitelist only. Renderer cannot run SQL or access Node APIs.
- **Renderer**: React UI. Calls `window.api.*`. Must not embed financial calculations as the source of truth.

## Future cloud sync (not enabled)

`sync_outbox` and `sync_metadata` exist so a later worker can:

1. Keep committing locally first.
2. Insert an outbox row for each durable change.
3. Drain `PENDING` rows to Supabase when online.
4. Use record UUIDs and UTC timestamps for idempotency.

Until that worker exists, `cloud_sync_enabled` stays `0`. Do not initialize a cloud SDK in this phase.

## Assumptions

- One local database per installed machine. Multi-terminal sharing needs a later local server; it is not implemented.
- Card, wallet, WhatsApp, email, and payment-gateway features are recorded as methods/notes only; no live processor is integrated.
- QR/kiosk screens are local simulators, not public internet ordering.

# Project status (verified)

**Document:** `docs/specification.txt` (v2.0)  
**Stack:** Electron + React 18 + SQLite (`better-sqlite3`) + Vite + Tailwind  
**Date:** 28 October 2026

## What was audited and fixed in this pass

The previous “100% complete” status was not accurate. Several UI flows existed while security or financial rules were incomplete. This pass verified repository/IPC/UI behavior against the SRS and implemented the gaps below.

### Security and first-run

- Local **owner setup wizard** when the user table is empty (no public staff registration).
- Repeat setup is **blocked** after the first administrator exists.
- Login no longer grants all permissions locally, and one-click/fallback passwords were removed.
- IPC handlers now **require a session** (and permissions) instead of allowing unauthenticated calls.
- Staff-created logins use **scrypt** hashes compatible with PIN/password login.
- Managers cannot assign **super_admin** to themselves or others.

### Financial and inventory integrity

- Duplicate sale completion is blocked.
- **Refunds** write `refunds` rows, update `refunded_cents`, restock recipes when requested, reverse loyalty when a sale is fully refunded, and feed cash-session refund totals.
- Recipe stock deduction is **idempotent** (`stock_posted`).
- Table **merge** moves items onto a surviving order and cancels the source with audit history.

### Local operations

- Kitchen windows listen for local IPC events (`kitchen:new-order`, `kitchen:order-update`) in addition to polling.
- Settings can **backup** and **restore** SQLite files, with header validation and a pre-restore safety snapshot.
- `sync_outbox` remains a **local queue only** (`docs/ARCHITECTURE.md`). Supabase is not connected.

## Automated tests actually executed

| Suite | Result |
| :--- | :--- |
| `test:db` | Passed (schema v10, backup/restore) |
| `test:auth` | Passed (including blocked repeat setup) |
| `test:catalog` | Passed |
| `test:pos` | Passed (duplicate payment, refund, table merge) |
| `test:kitchen` | Passed |
| `test:inventory` | Passed (recipe deduction) |
| `test:staff` | Passed |
| `test:crm` | Passed |
| `test:delivery` | Passed |
| `test:reports` | Passed |

Run all of them with `npm run test:all`.

`npm run build` (Windows installer) was **not** executed in this pass.

## Remaining SRS items (not fake-completed)

These remain incomplete or local-only by design:

- True **multi-branch** stock transfer, head-office consolidation, and multi-terminal shared DB.
- Live **payment gateways**, email/WhatsApp, and public QR/kiosk internet ordering.
- Item-level partial returns (full/partial **order** refunds work).
- Buy-X-get-Y / happy-hour pricing engines.
- Recurring expenses, expense approval workflows, purchase returns, unit conversions, salary/payroll.
- PDF/Excel report export and physical printer drivers (receipt preview exists).
- Persistent sessions across app restart (in-memory session; re-login required).
- Packaged Electron installer verification on a clean Windows machine.

Demo users (`admin` / `admin123`) are created **only** when tests seed with `seed: true` or `POS_DEMO_USERS=1`. A fresh production database uses the setup wizard.

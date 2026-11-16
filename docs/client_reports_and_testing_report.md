# Restaurant OS — Reports & Analytics  
## Delivery status and testing report

**Product:** Restaurant OS (offline-first POS)  
**Specification:** `docs/specification.txt` v2.0, Section 21  
**Version:** 1.0.1  
**Date:** 16 November 2026  
**Audience:** Client / project owner  

This document is for client review. It states what is **delivered**, what is **partial**, and what is **not included**. Figures in reports come from the live SQLite database (paid orders only). The browser demo uses sample data and is not the production source of truth.

---

## 1. How to open reports

Desktop app → **Reports** (permission: `reports:view`).

**Filters available on every report screen**

| Filter | Delivered |
| :--- | :--- |
| Date from / to | Yes |
| Branch (this branch / all / pick branch) | Yes |
| Order type (dine-in / takeaway / delivery) | Yes |
| Cashier | Yes |
| Payment method (cash / card / credit card / wallet) | Yes |

**Export (all report tabs)**

| Output | Delivered | Note |
| :--- | :--- | :--- |
| On-screen tables and totals | Yes | |
| Print | Yes | Opens a print window |
| PDF | Partial | Use Print → Save as PDF (Windows print dialog). No separate PDF file generator. |
| CSV | Yes | Excel-friendly UTF-8 CSV |
| Excel | Partial | Downloads an `.xls` spreadsheet (HTML workbook). Not a native `.xlsx` file. |

---

## 2. Specification checklist — Section 21

| Report | Spec requirement | Status | What the client sees |
| :--- | :--- | :--- | :--- |
| Sales | Date, branch, order type, cashier, payment method. Gross, refunds and net shown separately. | **Done** | Cards: Gross sales, Refunds, Net sales, Average ticket. Tables: channel, payment method, cashier, daily timeline. |
| Product sales | Product, category, quantity, revenue | **Done** | Ranked product table with category, qty, revenue. Extra product/category pickers are not on the screen (date/branch/type/cashier/payment filters still apply). |
| Category sales | Category-wise quantity and revenue | **Done** | Category table. |
| Profit | Sales, food cost, expenses, estimated net profit | **Done** | Four totals: Sales, Food cost (COGS), Expenses, Estimated net profit + margin %. Estimated from recipe deductions + recorded expenses. |
| Food cost | Recipe cost, selling price, food-cost % | **Done** | Per product: recipe cost, selling price, food-cost %. |
| Inventory | Current stock, valuation, low stock, movement | **Done** | Stock value, low-stock count, item table, movement table. |
| Purchases | Vendor, item, date, quantity, amount | **Done** | Purchase line table (vendor, item, date, qty, amount). Empty if no POs in the date range. |
| Vendor statement | Invoices, returns, payments, outstanding | **Done** | Per vendor: invoices, returns, payments, outstanding. |
| Expenses | Category, branch, date, amount | **Done** | Totals by expense category for the date range. |
| Cashier | Orders, cash, card, refunds, variance | **Done** | Cashier totals + cash session list (opening/closing, expected vs counted where recorded). |
| Staff | Sales / orders / attendance by employee | **Done** | Staff sales table + attendance counts by status. |
| Delivery | Rider, orders, delivery status, cash collected | **Done** | Status totals + rider table (orders, delivered, failed, COD). |
| Customers | Orders, spending, loyalty, last order | **Done** | Customer table with those columns. |
| Refunds | Returned items, reasons, amount, user | **Done** | Refund table: order number, amount, reason, method, cashier, returned items, time. |
| Reservations | Bookings, completed, cancelled, no-show | **Done** | Counts grouped by reservation status. |
| Branch comparison | Sales, profit, orders, costs by branch | **Done** | One row per branch. |

**Also delivered (not listed as a named row in Section 21)**

| Extra report | Status |
| :--- | :--- |
| Hourly sales (00:00–23:00 peak hours) | Done |
| Voids / cancellations / discounted orders | Done (Reports → Voids & log) |
| Security audit log | Done as a separate **Audit log** module (permission `audit:view`). The Reports “Voids & log” tab still shows voids/discounts; full security log needs audit permission. |

---

## 3. Not delivered / not in this reports release

These items are **out of the current Reports module** or only partly met. They should not be promised as complete.

| Item | Status | Comment |
| :--- | :--- | :--- |
| Dedicated QR vs Kiosk vs POS analytics (order count, revenue, AOV, peak by source) | **Not delivered** | Spec §37.4. Sales split is by dine-in / takeaway / delivery, not by POS / QR / KIOSK source. |
| Interactive charts / dashboards (graphs) | **Not delivered** | Tables and KPI cards only. |
| Native Excel `.xlsx` | **Not delivered** | `.xls` HTML export only. |
| Generated PDF file (no print dialog) | **Not delivered** | Print → Save as PDF. |
| Scheduled / emailed reports | **Not delivered** | No email/SMS provider. |
| Cloud analytics dashboard | **Not delivered** | Optional future item in spec §34. |
| Kitchen prep-time report on the Reports screen | **Partial** | Data API exists; no report tab in the UI. |
| Head-office multi-company consolidation | **Not delivered** | Branch comparison is local SQLite only. |
| Product / category dropdown filters on the report toolbar | **Not in UI** | Engine can filter; the screen uses the shared date/branch/type/cashier/payment filters. |
| Browser (Vercel) demo as live accounts | **Demo only** | Web demo uses mock figures. Production reports are the Windows desktop app + SQLite. |

---

## 4. Testing report

**Environment:** Windows, Node, Electron test runner against a **fresh temporary SQLite file** (not the live shop database).  
**Command:** `npm run test:reports`  
**Executed:** 16 November 2026  
**Result:** **PASS** (all 10 automated cases)

### 4.1 Automated cases

| # | Case | Result | Evidence |
| :--- | :--- | :--- | :--- |
| 1 | Database init + seed + PIN login | Pass | Schema v19 applied. Branch “Main Flagship Branch”. User Administrator. |
| 2 | Sales summary after a paid discounted order | Pass | 1 order, sales $27.93, discount $2.00, average $27.93 |
| 3 | Product performance + category breakdown | Pass | 1 item (Classic Angus Cheeseburger, qty 3), 1 category |
| 4 | Hourly breakdown | Pass | 24 hour slots; 1 slot with sales |
| 5 | Profit & loss | Pass | Revenue $27.93. COGS $0.00 and expenses $0.00 on this seed (no recipe deduction / no expenses in the scratch DB). Net = sales. |
| 6 | Discount / void audit | Pass | 1 discounted order, 0 voids |
| 7 | Settings read / update | Pass | Tax rate saved as 7.5% |
| 8 | Sales filters (dine-in + cashier) | Pass | Filtered count = 1 |
| 9 | Food cost, cashier, purchases, vendors, branches, staff | Pass | Food cost 9 rows; cashier 1 row; purchases **0** rows (no PO in range); vendors 4; branches 1; staff sales 5 |
| 10 | Audit log list | Pass | 4 entries retrieved |

### 4.2 What the automated suite does **not** prove

- Print / CSV / Excel buttons (UI only; not in this Electron DB test).
- Live shop data (tests use a throwaway file that is deleted after the run).
- Refunds, deliveries, reservations, inventory movement with real operational volume.
- Permission denial (a cashier without `reports:view` cannot open Reports — covered by IPC guards, not this suite).
- QR/Kiosk source comparison (feature not built).

### 4.3 Suggested client UAT (15–20 minutes)

Use the **desktop app** with real or demo seed data.

1. Login as a manager/admin. Open **Reports**.
2. Set today (or last 7 days). Confirm **Gross / Refunds / Net** match a known paid order.
3. Open **Product sales** and **Category sales**. Confirm quantities match kitchen/POS history.
4. Process a small **refund**, refresh **Refunds** and **Sales** net.
5. Open **Cashier** after a cash session. Check orders vs cash/card.
6. Open **Inventory**. Confirm low-stock flags match stock screen.
7. Click **CSV**, **Excel**, **Print / PDF** on Sales. Confirm a file / print preview appears.
8. Login as a cashier **without** reports permission. Confirm Reports is hidden or blocked.
9. (Optional) Open **Audit log** as admin after a refund; confirm user, time, action, order reference.

Sign-off: ______________________  Date: __________

---

## 5. Summary for the client

| | |
| :--- | :--- |
| Section 21 named reports | **16 / 16 on screen**, fed from SQLite |
| Shared filters | Date, branch, order type, cashier, payment method |
| Export | CSV yes · Print/PDF via print dialog · Excel as `.xls` |
| Automated reports tests | **Pass** (`npm run test:reports`) |
| Still open | QR/Kiosk channel analytics, charts, native xlsx, emailed reports, cloud dashboard |

Reports are ready for **operational use on the Windows POS**. Items in section 3 can be scheduled as a later phase if required.

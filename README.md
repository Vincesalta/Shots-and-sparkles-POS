# Shots & Sparkles POS

A responsive point-of-sale and store-management prototype for Shots & Sparkles. Built with React, TypeScript, and Vite.

The app is installable as a Progressive Web App. After opening it online once, the service worker caches the app shell so it can be reopened offline. Products, orders, inventory, staff, and audit entries stay in that browser's storage while offline.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Production assets can be checked with `npm run build`; source linting uses `npm run lint`.

For offline/PWA verification, serve the production build over HTTPS (localhost is also permitted), open the app while connected, then disconnect and reload. Browser storage is not a substitute for a backup; avoid clearing site data on a register with unsynced orders.

## Cloud sync

Set `VITE_SYNC_API_URL` in a local `.env` file to an HTTPS endpoint, then restart Vite or rebuild. See `.env.example` for the variable name. Without this setting the app works offline and online on that device, and the header reports **Online · device only**; it does not claim that data reached the cloud.

The endpoint accepts a `POST` JSON snapshot with `schemaVersion`, `deviceId`, `sentAt`, `products`, `transactions`, `stock`, `stockMovements`, `customers`, `staff`, and `audit`. It must authenticate the request, merge the incoming records with the shared store without dropping records from other devices, and return `{ "snapshot": { "products": [], "transactions": [], "stock": [], "stockMovements": [], "customers": [], "staff": [], "audit": [] } }` as the canonical merged state. The client sends same-origin cookies (`credentials: include`) and retries the current local snapshot after reconnect or local changes. The sync service and its database are not included; deploy an authenticated API before expecting cross-device sync.

## Admin email-code sign-in

Admin login sends a short-lived, one-time code to the single Gmail address configured as `ADMIN_EMAIL`. The code is entered directly in the POS login dialog; there is no separate Google sign-in page and the app never asks for the Gmail password. The included Node server creates and verifies codes, and sends them through Gmail SMTP. Codes expire after 10 minutes, can only be used once, and are limited to five verification attempts. Code requests are throttled. Codes are held in server memory, so a server restart invalidates any pending code.

### Run locally

1. In the Gmail account that will send sign-in codes, enable 2-Step Verification and create a Google **App password**. Use the 16-character app password, not the account's regular password. If your Google account does not offer app passwords, use an SMTP-capable Workspace setup or another mail transport.
2. Copy `.env.example` to `.env`. Set `ADMIN_EMAIL` and `VITE_ADMIN_EMAIL` to the same authorized Gmail. Set `SMTP_USER` to the Gmail sender account and `SMTP_PASS` to its app password. `SMTP_HOST=smtp.gmail.com` and `SMTP_PORT=465` are the Gmail SMTP settings. Keep the app password server-side; never add a `VITE_` prefix to it or commit `.env`.
3. Run `npm run dev`. The command starts the email-code API on port 8787 and Vite on port 5173; Vite proxies `/api` to the API. Check `/api/health`; `emailCodeSignInConfigured` is `true` when the server has the required values.

### Deploy to Render

Use the included `render.yaml` Blueprint and provide `ADMIN_EMAIL`, `VITE_ADMIN_EMAIL` (the same authorized Gmail), `SMTP_USER` (the Gmail account sending codes), and `SMTP_PASS` (that account's app password). Treat `SMTP_PASS` as a secret. Render builds the Vite app and serves it with the email-code API from the same Node service. Check `/api/health` to confirm `emailCodeSignInConfigured` is `true`.

The server only sends codes to the configured `ADMIN_EMAIL` and never returns a code to the browser. It keeps code hashes in memory and removes codes after successful verification. Local POS data remains device-local; this prototype does not provide server-enforced authorization for the POS data itself.

## Included workflows

- Seeded beverage menu with all requested flavors, sizes, and PHP prices.
- Product search and category filters, size/sugar/add-on customization, quantity controls, discounts, VAT calculation, cash and GCash checkout, change calculation, and printable receipts.
- Park and resume multiple in-progress orders without losing their items, discounts, or selected customer; parked orders stay on the current device.
- Product CRUD includes image upload/edit/removal, availability, pricing, and recoverable archive.
- Inventory create/edit/delete, searchable and low-stock filters, reorder points, sale deductions, and separate restock/adjustment/sale movement history.
- Customer create/edit/archive/restore, selection on a sale, lifetime sales totals, and customer-specific receipt history.
- Manager views keep customer sales/receipts separate from staff audit entries and inventory movement logs.
- Sales & Receipts is the transaction register, Activity Log is staff/admin activity, and Inventory has its own stock movement history.
- Staff list management, reports, settings, and audit activity.
- Cashier access to POS, their transactions, and shift closeout.
- Admin sign-in by one-time email code sent to the authorized Gmail.
- Sign-in persists when the app is closed and reopened, and expires after five minutes without activity.
- Required cashier name before POS entry, with cashier/admin sign-in events included in the audit log and cashier identity on each transaction.
- Local browser persistence for menu, inventory, staff, audit entries, and transactions.
- Local browser persistence for parked orders, including across reloads and offline use.

## Prototype notes

This is a client-side POS demo with a small Node service for admin email-code verification. Email delivery will not work until a valid Gmail SMTP account and app password are configured. Even with email codes configured, a user with browser access can alter local data or bypass the UI. Data is not backed up or shared across devices. Connect server-enforced authorization and a secure backend before using this for live sales. The logo mark and drink illustrations are in-app approximations because official artwork was not included in the workspace. The contact number remains the redacted placeholder supplied in the request.
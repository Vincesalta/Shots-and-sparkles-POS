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

## Admin sign-in

Admin login supports Google sign-in and a one-time email code, both limited to the single Gmail address configured as `ADMIN_EMAIL`. Google ID tokens are verified server-side for signature, issuer, expiry, audience, verified email, and the admin allowlist. Email codes are entered directly in the POS login dialog; the app never asks for a Gmail password. Codes are sent through Gmail SMTP, expire after 10 minutes, can only be used once, and are limited to five verification attempts. Code requests are throttled. Codes are held in server memory, so a server restart invalidates any pending code.

### Run locally

1. Create a Google OAuth **Web application** client. Add `http://localhost:5173` to its authorized JavaScript origins. Use the existing client ID for both `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`; no OAuth client secret belongs in this app.
2. For email-code fallback, enable 2-Step Verification on the Gmail sender and create a Google **App password**. Set `SMTP_USER` to that Gmail and `SMTP_PASS` to the app password. `SMTP_HOST=smtp.gmail.com` and `SMTP_PORT=465` are the Gmail SMTP settings.
3. Copy `.env.example` to `.env`. Set `ADMIN_EMAIL` and `VITE_ADMIN_EMAIL` to the same authorized Gmail, and set the Google client ID and optional email settings described above. Keep `SMTP_PASS` server-side; never give it a `VITE_` prefix or commit `.env`.
4. Run `npm run dev`. The command starts the auth API on port 8787 and Vite on port 5173; Vite proxies `/api` to the API. Check `/api/health`; `googleSignInConfigured` and `emailCodeSignInConfigured` independently report the corresponding server settings.

### Deploy to Render

Use the included `render.yaml` Blueprint and provide `ADMIN_EMAIL`, `VITE_ADMIN_EMAIL` (the same authorized Gmail), and the same OAuth web client ID for `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`. In Google Cloud Console, add the deployed Render service URL as an authorized JavaScript origin. For email-code fallback, also set `SMTP_USER` and `SMTP_PASS` (the sender Gmail's app password). Treat `SMTP_PASS` as a secret. Check `/api/health` for `googleSignInConfigured` and `emailCodeSignInConfigured`.

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
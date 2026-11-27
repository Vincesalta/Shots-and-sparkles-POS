# Shots & Sparkles POS

A responsive point-of-sale and store-management prototype for Shots & Sparkles. Built with React, TypeScript, and Vite.

The app is installable as a Progressive Web App. After opening it online once, the service worker caches the app shell so it can be reopened offline. Products, orders, inventory, staff, and audit entries stay in that browser's storage while offline.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Production assets can be checked with `npm run build`; source linting uses `npm run lint`.

The customer ordering app is a separate page at `/customer.html`; the staff welcome screen links directly to customer login, which opens without an extra portal step. The root app remains the staff POS and retains its server-backed admin sign-in. Customer sign-in and saved session are isolated from staff sign-in, and the customer build is forced into buyer-only mode.

The staff POS and customer menu use a fixed cart icon with an item-count badge. Tap it to open the order drawer, adjust quantities, review totals, and continue to checkout. Accepted customer orders remain in a floating staff queue with item details, fulfillment information, and customer contact details.

Both installable app manifests use `images/icon.jpg` as their launcher icon.

Customer checkout collects dine-in or delivery, requires an address for delivery, and requires a GCash reference number when GCash is selected. Managers and cashiers can accept or decline new customer orders; accepted orders remain in an in-progress queue until staff marks them ready, on the way, or complete. Customers see order-status updates in their order history, with pickup-ready or delivery-on-the-way messages when preparation is finished. These updates are shared across devices only when the configured sync service is available. Customer profiles are device-local and are not server-authenticated accounts.

Customer sign-ins appear in the manager’s Customer portal accounts list, where accounts can be blocked, unblocked, or deleted. These account controls apply to data available on the current device or through a configured shared sync service; without shared sync, an account created on a separate customer phone is not visible to the admin device.

The customer and staff pages on the same browser origin can read shared local data. Separate phones and computers require an authenticated, persistent sync API configured through `VITE_SYNC_API_URL`; the Render server in this repository does not provide that store-sync API. Do not expect orders placed on a separate customer phone to appear in the admin app until that API is deployed and configured.

For offline/PWA verification, serve the production build over HTTPS (localhost is also permitted), open the app while connected, then disconnect and reload. Browser storage is not a substitute for a backup; avoid clearing site data on a register with unsynced orders.

## Cloud sync

Set `VITE_SYNC_API_URL` in a local `.env` file to an HTTPS endpoint, then restart Vite or rebuild. See `.env.example` for the variable name. Without this setting the app works offline and online on that device, and the header reports **Online · device only**; it does not claim that data reached the cloud.

The endpoint accepts a `POST` JSON snapshot with `schemaVersion`, `deviceId`, `sentAt`, `products`, `transactions`, `stock`, `stockMovements`, `customers`, `staff`, and `audit`. It must authenticate the request, merge the incoming records with the shared store without dropping records from other devices, and return `{ "snapshot": { "products": [], "transactions": [], "stock": [], "stockMovements": [], "customers": [], "staff": [], "audit": [] } }` as the canonical merged state. The client sends same-origin cookies (`credentials: include`) and retries the current local snapshot after reconnect or local changes. The sync service and its database are not included; deploy an authenticated API before expecting cross-device sync.

## Admin sign-in

Admin login accepts only the Gmail configured as `ADMIN_EMAIL` and a separate store password configured as `ADMIN_PASSWORD` on the server. The password is checked server-side and must not be the Gmail account password or a Gmail app password. Sign-in attempts are rate limited. The optional SMTP email-code API is separate from password sign-in.

### Run locally

1. Copy `.env.example` to `.env`. Set `ADMIN_EMAIL` and `VITE_ADMIN_EMAIL` to the authorized Gmail. Set `ADMIN_PASSWORD` to a strong, unique store password. Keep it server-side: never prefix it with `VITE_` or commit `.env`.
2. `SMTP_USER` and `SMTP_PASS` are only needed if you separately use the email-code API. Keep `SMTP_PASS` server-side as well.
3. Run `npm run dev`. The command starts the auth API on port 8787 and Vite on port 5173; Vite proxies `/api` to the API.

### Deploy to Render

Use the included `render.yaml` Blueprint and set `ADMIN_EMAIL`, `VITE_ADMIN_EMAIL` (the same authorized Gmail), and a strong `ADMIN_PASSWORD` in the Render environment. The Render `SMTP_PASS` only matters for the optional email-code API.

After deployment, open `https://<your-render-service>/api/health`. Password sign-in requires both `adminEmailConfigured` and `adminPasswordConfigured` to be `true`. If either is `false`, add the missing server environment variable in Render's **Environment** settings and redeploy. The `VITE_` email variable only prefills the login form; it does not configure server authentication.

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
- Admin sign-in with the authorized Gmail and server-configured store password.
- Sign-in persists when the app is closed and reopened, and expires after five minutes without activity.
- Required cashier name before POS entry, with cashier/admin sign-in events included in the audit log and cashier identity on each transaction.
- Local browser persistence for menu, inventory, staff, audit entries, and transactions.
- Local browser persistence for parked orders, including across reloads and offline use.

## Prototype notes

This is a client-side POS demo with a small Node service for admin email-code verification. Email delivery will not work until a valid Gmail SMTP account and app password are configured. Even with email codes configured, a user with browser access can alter local data or bypass the UI. Data is not backed up or shared across devices. Connect server-enforced authorization and a secure backend before using this for live sales. The logo mark and drink illustrations are in-app approximations because official artwork was not included in the workspace. The contact number remains the redacted placeholder supplied in the request.

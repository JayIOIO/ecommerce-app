# Frontend QA execution record

**Date:** 2026-10-13  
**Browser:** Chromium in the VS Code integrated browser; exact version unavailable.  
**UI:** `http://localhost:5173/`, local Vite development server and local Vite API proxy.  
**Services:** Local auth, catalog, and order APIs; `/health` returned HTTP 200 for all three.  
**Scope limit:** This was not run through the team's deployment reverse proxy. It is not CI/CD, persistence-volume, or rollback evidence.

The browser flows used uniquely named disposable accounts, listing data, and synthetic shipping information. Those identifiers are in a private local note and are intentionally omitted here. No password, token, real customer data, or unredacted API response is included. Disposable users, QA listings, and the delivered test order were removed after the run. The earlier pending order was cancelled through the UI. The saved [sign-in](frontend-build-label-login.png) and [signed-in](frontend-build-label-signed-in.png) screenshots show the local QA label and a synthetic display name only; they do not claim a release or deployed image.

## Scenario results

### UI-01

Buyer signup succeeded. The signed-in UI showed buyer identity and buyer navigation.

### UI-02

Logged out and logged back in as the disposable buyer. Login succeeded and buyer navigation appeared.

### UI-03

Searched for `Mechanical` with category `Electronics`. Mechanical Keyboard appeared; Smart Watch was excluded.

### UI-04

Added Mechanical Keyboard, changed quantity to 2, and observed the total update to `$159.98`. Checkout emptied its cart. In a separate disposable buyer session, removed a cart item and observed the empty-cart state.

### UI-05

Checked out 2 × Mechanical Keyboard for `$159.98`; success notification appeared, cart cleared, and order history opened. A separate checkout of the seller-created QA listing for `$4.50` also succeeded.

### UI-06

Buyer history showed the generated order number, synthetic shipping address, Cash on Delivery, items, total, and status. After seller fulfillment it showed `Delivered`.

### UI-07

Cancelled a separate Pending order and confirmed it disappeared; buyer history showed `No order records found.`

### UI-08

Seller signup succeeded. The signed-in UI showed seller identity and `My Listings` / `Seller Orders` navigation.

### UI-09

Logged out and logged back in as the disposable seller. Login succeeded and seller navigation appeared.

### UI-10

Created two seller-owned disposable listings. Both appeared in seller inventory; the fulfillment listing was visible in public buyer search.

### UI-11

Edited one listing's name and price from `$5.25` to `$6.25`. The new values appeared in inventory.

### UI-12

Confirmed deletion of the other listing. It disappeared and inventory showed its empty state.

### UI-13

Seller order view showed the order containing the seller's test item, buyer display name, and `Pending` status.

### UI-14

Advanced the seller's order item through `Processing`, `Shipped`, and `Delivered`. Each update appeared in the seller view; buyer history showed `Delivered`.

### UI-15

Buyer navigation did not include seller controls. Using a valid disposable buyer login, `GET /api/products/mine` and `GET /api/orders/seller` returned HTTP 403, as required for seller-only routes; buyer order history returned HTTP 200.

## Build identifier evidence

Built the frontend with `VITE_BUILD_ID=local-qa-20261013`, served that bundle with Vite preview, and visually confirmed the label on the sign-in screen. Started the Vite dev server with the same local identifier and confirmed it remained visible in the signed-in header. Screenshots: [sign-in](frontend-build-label-login.png) and [signed-in](frontend-build-label-signed-in.png). This identifier is a local QA label, not a deployed build claim.

## Local integration smoke test

Ran `npm run test:smoke` against the local auth, catalog, and order services and configured disposable MySQL database. Buyer/seller signup, listing creation, public search, checkout with database-calculated total, seller order visibility, Processing/Shipped/Delivered transitions, and buyer history all passed. The test's targeted cleanup removed the accounts, order/items, and product it created. Exit code was 0.

Also ran a failure-path check with `SMOKE_ORDERS_URL` pointed at an unavailable local port. The test passed buyer/seller signup, listing creation, and search, failed at checkout, cleaned up all created data, and exited with code 1. Riboroso review and CI wiring remain outstanding.

## Observed 403 from the earlier session

The earlier browser session on 2026-10-12 showed HTTP 403 errors from protected seller-data requests. Fresh disposable buyer and seller sessions completed the local role workflows. Buyer requests to seller-only endpoints correctly return 403. The old seller token's precise cause was not established, and no reproducible application defect or issue was filed.

## Cleanup and remaining validation

Targeted cleanup removed the disposable buyer/seller accounts, one delivered QA order, and one seller-owned QA product; temporary cart and build-evidence buyers and the edited listing were also removed. The browser was logged out. Repeat the QA through the integrated deployment proxy after it is available, and capture workflow screenshots there.

# Safe-COD — Issues to Fix (Instructions for the AI Coding Agent)

You are working on **Safe-COD**, a PERN-stack portfolio project (React 19 + Vite + Tailwind 3 frontend, Node/Express 4 backend using the raw `pg` driver, PostgreSQL). Below is a prioritised list of bugs, security gaps and inconsistencies found during a code review. Fix them as specified.

---

## Rules for this task

1. **Work in priority order** (P0 → P1 → P2 → P3). After finishing each priority level, stop and summarise what you changed and which files were touched.
2. **Minimal, targeted changes.** Do not refactor unrelated code, rename files, restyle the UI, or change the visual design.
3. **Keep the existing conventions:** backend = CommonJS (`require`), frontend = ES modules, raw SQL with **parameterised queries** (`$1, $2`) only, no ORM, existing response envelope `{ status, message?, data }`, existing `AppError` + `errorHandler` pattern.
4. **Keep the demo OTP behaviour** (`DEMO_OTP`, default `1234`, shown in the UI and returned as `_demo`). Recruiters must be able to test the OTP step. Do **not** remove it.
5. **Do not change the scoring weights or threshold** (start 100, RTO −30, delivered +10, pending −5, COD allowed at ≥ 40) unless an issue says so.
6. **Never commit secrets.** No real passwords or tokens in code or docs; use placeholders.
7. **Database changes must come as migration files** (see "Migrations" below) **and** be reflected in `schema.sql`, because the deployed database already exists and must be upgraded in place.
8. For each issue, after implementing, re-read the "Acceptance criteria" and verify them. If you cannot run something (e.g. no database access), say so explicitly rather than claiming it works.

### Migrations

Create a folder `migrations/` at the repo root. Each migration is a plain `.sql` file, numbered (`001_…`, `002_…`), written to be **safe to re-run** (`IF NOT EXISTS`, `DROP VIEW IF EXISTS`, etc.). Keep `schema.sql` (repo root) up to date so a fresh install gets the final schema in one run.

---

# P0 — Must fix (visible bugs / security)

## ISSUE 1 — A wrong OTP (or wrong login) logs the user out

**Files:** `frontend/src/api/index.js`, `backend/src/routes/orders.js`

**Problem.** The Axios response interceptor treats *every* HTTP 401 as "session expired": it clears `token`/`user` from `localStorage` and sets `window.location.href = '/login'`. But the backend also returns 401 for:
- a wrong OTP in `POST /api/orders/:orderId/verify-otp` (`'Incorrect OTP. Please try again.'`)
- wrong credentials in `POST /api/users/login`

Result: typing a wrong OTP on checkout logs the user out and redirects to `/login`; a wrong login causes a full page reload so the error toast is lost.

**Required changes.**
1. In `frontend/src/api/index.js`, change the response interceptor so it **does not** clear storage or redirect when the failing request is an auth attempt. Use `err.config?.url` and skip when it includes `/users/login` or `/users/register`, or ends with `/verify-otp`. Also only redirect if `window.location.pathname !== '/login'`. All other 401s must keep the current behaviour (clear storage, redirect to `/login`).
2. In `backend/src/routes/orders.js`, change the status code for an **incorrect OTP** from `401` to `400` (a wrong OTP is a bad request, not an authentication failure). Keep the message text.

**Acceptance criteria.**
- On checkout, entering a wrong OTP shows the error message and shake animation in `OtpModal`, the user **stays logged in**, and the cart is intact.
- Entering a wrong password/phone on `/login` shows an error toast and **does not reload the page**.
- Deleting/expiring the JWT and then opening `/orders` still redirects to `/login`.

---

## ISSUE 2 — Prepaid orders are stuck in `pending_otp` forever; checkout is not atomic

**Files:** `backend/src/routes/checkout.js`

**Problem.**
- Every order is inserted with status `'pending_otp'`. COD orders leave that state through `verify-otp`; **prepaid orders have no OTP**, `verify-otp` rejects them (`payment_method !== 'cod'`), and the admin transition table has no moves out of `pending_otp`. They stay "Awaiting OTP" forever and **stock is never deducted**.
- Step 4 inserts the address, the order and the order items with separate `pool.query()` calls. If one fails midway, orphan rows remain.
- There is an unused variable (`const offset = i * 3;`) and a misleading comment mentioning `FOR SHARE` that is not implemented.

**Required changes.** Keep the validation, risk check and response shape; change how the order is persisted:
1. After input validation and the COD risk check, perform the product lookup and all inserts inside **one transaction** using a dedicated client:
   ```js
   let client;
   try {
     client = await pool.connect();
     await client.query('BEGIN');
     // ... product lookup, inserts, (prepaid) stock deduction ...
     await client.query('COMMIT');
   } catch (err) {
     if (client) await client.query('ROLLBACK').catch(() => {});
     return next(err);
   } finally {
     if (client) client.release();
   }
   ```
   (Note: with `return next(...)` for validation errors *inside* the transaction, `ROLLBACK` first.)
2. Fetch products with a **consistent lock order** to avoid deadlocks: `SELECT id, name, price, stock_quantity FROM products WHERE id = ANY($1::uuid[]) AND is_active = true ORDER BY id FOR UPDATE` when `paymentMethod === 'prepaid'`; for COD a plain `ORDER BY id` read is fine (COD stock is still deducted later in `verify-otp`).
3. **COD behaviour is unchanged:** status `pending_otp`, hashed OTP + expiry, no stock deduction, `_demo` OTP in the response.
4. **Prepaid behaviour (new):** insert the order with status `'verified'`, `otp_hash`/`otp_expires_at` = `NULL`, and in the same transaction deduct stock for every item with `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`. Re-check `quantity <= stock_quantity` inside the transaction (after the `FOR UPDATE` read) and return a 400 with the existing "Insufficient stock…" message (after `ROLLBACK`). The DB `CHECK (stock_quantity >= 0)` remains the backstop (error `23514` → 409 via the existing error handler).
5. Remove the unused `offset` variable and the inaccurate `FOR SHARE` comment; update comments to describe the new transaction.
6. The success `message` and response shape stay the same (`data.order.status` will now be `'verified'` for prepaid; `_demo` only for COD).

**Acceptance criteria.**
- Place a **prepaid** order → it appears in *My Orders* as **Verified** (not "Awaiting OTP"), product stock decreases by the ordered quantity, and it appears in the admin dashboard where the admin can move it to **Dispatched → Delivered/RTO**.
- Place a **COD** order → still `pending_otp`, stock unchanged until OTP verification, OTP modal still works.
- Force a failure in the `order_items` insert (e.g. temporarily pass an invalid product id in a test) → **no** address or order row is left behind.
- Ordering more than the available stock with prepaid returns a clear 400 and changes nothing.

---

## ISSUE 3 — Passwords are not stored or checked (anyone can log in, including as admin)

**Files:** `schema.sql`, `migrations/001_add_password_hash.sql` (new), `backend/src/routes/users.js`, `backend/scripts/set-password.js` (new), `frontend/src/pages/LoginPage.jsx`, `README.md`

**Problem.** `POST /register` computes `bcrypt.hash(...)` but discards it (`void passwordHash;`) because the `users` table has no password column. `POST /login` never compares the password, so any non-empty password logs in as any phone number — including the seeded admin `+923001234567`. `LoginPage` even advertises "Admin demo: any password".

**Required changes.**
1. **Schema:** add `password_hash VARCHAR(100)` to the `users` table in `schema.sql`, and create `migrations/001_add_password_hash.sql` containing `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(100);`.
2. **Register (`users.js`):** include `password_hash` in the `INSERT`; remove `void passwordHash` and the "demo / not using it" comments. The `RETURNING` clause must **not** return `password_hash`.
3. **Login (`users.js`):** add `u.password_hash` to the `SELECT`. Then:
   - if the user is not found, **or** `password_hash` is `NULL`, **or** `!(await bcrypt.compare(password, user.password_hash))` → return the same generic `AppError('Incorrect phone number or password.', 401)`;
   - only after the password is verified, check `is_active` (403 if deactivated);
   - never include `password_hash` in any response or log.
   - Remove the "demo: accept any non-empty password" comments.
4. **Admin / existing users:** create `backend/scripts/set-password.js` — a CLI script (`node scripts/set-password.js <phoneNumber> <newPassword>`) that loads `.env` via `dotenv`, hashes the password with `bcryptjs` (cost 12) and runs `UPDATE users SET password_hash = $1 WHERE phone_number = $2`, then prints how many rows were updated and closes the pool. Do **not** hard-code any password in the repo.
5. **`LoginPage.jsx`:** remove the "any password" demo hint box; replace it with a one-line note: "Demo credentials are listed in the README."
6. **README:** in the demo-credentials table, replace "any non-empty string" with the placeholder `<set via scripts/set-password.js — fill in your chosen demo password>` (the project owner will put the real demo password here). Document the script and that users created before this change must have a password set with it (or re-register with a different phone number).

**Acceptance criteria.**
- Registering a new user stores a bcrypt hash (verify with a SQL `SELECT password_hash FROM users …`, it starts with `$2`).
- Logging in with the **correct** password works; with a **wrong** password returns 401 `Incorrect phone number or password.`; with an unknown phone returns the same 401.
- A user whose `password_hash` is `NULL` cannot log in.
- After running `set-password.js` for the admin phone, admin login works only with that password.
- No response body ever contains `password_hash`.

---

# P1 — Should fix (logic gaps, robustness, repo hygiene)

## ISSUE 4 — Blocked COD customers can never recover their score

**Files:** `schema.sql`, `migrations/002_update_risk_view.sql` (new), `frontend/src/pages/CheckoutPage.jsx` (blocked-screen text), `frontend/src/pages/RegisterPage.jsx` (explainer text), `frontend/src/pages/AdminDashboardPage.jsx` (tooltip), `README.md`

**Problem.** The `customer_risk_scores` view only counts **COD** orders (`LEFT JOIN … AND o.payment_method = 'cod'`). A customer with 3 COD RTOs (score 10) is blocked from COD, and prepaid orders do not change the score, so their score can **never** increase. The blocked screen says "Each successful delivery adds +10", which is currently untrue for them.

**Required change.** Let **delivered orders of any payment method** earn the +10 bonus, while **penalties (RTO, pending) still apply only to COD** orders. Replace the view with this definition (same output columns, same order; weights/threshold unchanged). Put it in `migrations/002_update_risk_view.sql` (using `DROP VIEW IF EXISTS` first, since the SQL changes) **and** in `schema.sql`:

```sql
DROP VIEW IF EXISTS customer_risk_scores;

CREATE VIEW customer_risk_scores AS
WITH counts AS (
  SELECT
    u.id AS user_id,
    u.phone_number,
    u.full_name,
    COUNT(*) FILTER (WHERE o.status = 'delivered')                                AS total_delivered,
    COUNT(*) FILTER (WHERE o.status = 'rto'         AND o.payment_method = 'cod') AS total_rto,
    COUNT(*) FILTER (WHERE o.status = 'pending_otp' AND o.payment_method = 'cod') AS total_pending,
    COUNT(*) FILTER (WHERE o.status IS NOT NULL)                                   AS total_orders
  FROM users u
  LEFT JOIN orders o ON o.user_id = u.id
  WHERE u.role = 'customer'
  GROUP BY u.id, u.phone_number, u.full_name
)
SELECT
  user_id, phone_number, full_name,
  total_delivered, total_rto, total_pending, total_orders,
  LEAST(GREATEST(100 + total_rto * -30 + total_delivered * 10 + total_pending * -5, 0), 100) AS risk_score,
  (LEAST(GREATEST(100 + total_rto * -30 + total_delivered * 10 + total_pending * -5, 0), 100) >= 40) AS is_cod_eligible
FROM counts;
```

Then update the wording that describes the old rule:
- `schema.sql` section-5 header comment (scoring algorithm description and "only COD orders affect the score").
- `CheckoutPage.jsx` → `CodBlockedScreen` hint: say that each **delivered order (COD or prepaid)** adds +10 points and that prepaid orders are the way to rebuild the score.
- `RegisterPage.jsx` risk-score explainer: "Each delivered order earns +10 pts. Each COD return (RTO) costs −30 pts."
- `AdminDashboardPage.jsx`: the `title="Total COD"` tooltip becomes `title="Total orders"`.
- `README.md`: the view description and the sentence "Only COD orders count toward the score".

**Acceptance criteria** (verify with SQL on a test DB):
- New customer → score 100.
- 3 COD orders with status `rto` → score **10**, `is_cod_eligible = false`.
- Add 3 **prepaid** orders with status `delivered` → score **40**, `is_cod_eligible = true`.
- A user with 2 `pending_otp` COD orders and 1 COD `rto` → 100 − 10 − 30 = **60**.
- `SELECT * FROM customer_risk_scores` returns the same column names as before; login, `/users/me`, checkout and the admin list all still work.

---

## ISSUE 5 — OTP brute-force protection (attempt limit) and OTP-state robustness

**Files:** `schema.sql`, `migrations/003_add_otp_attempts.sql` (new), `backend/src/routes/orders.js`

**Problem.** A 4-digit OTP has only 10,000 possibilities and there is no limit on wrong attempts. Also, if the stored `otp_hash` is `NULL` the expiry check misbehaves.

**Required changes.**
1. Add `otp_attempts INTEGER NOT NULL DEFAULT 0` to `orders` (schema + migration, `ADD COLUMN IF NOT EXISTS`).
2. In `verify-otp`, **before** comparing hashes: if `order.otp_hash` is `NULL` → `410` "This OTP is no longer valid. Please place the order again."
3. On a **wrong OTP**: `UPDATE orders SET otp_attempts = otp_attempts + 1 WHERE id = $1 RETURNING otp_attempts` and **`COMMIT`** (not rollback — the increment must persist), then:
   - if attempts `>= 5`: `UPDATE orders SET otp_hash = NULL, otp_expires_at = NULL …`, commit, and respond `429` "Too many incorrect attempts. Please place the order again.";
   - otherwise respond `400` "Incorrect OTP. N attempt(s) left." (N = 5 − attempts).
4. On success, reset is not required (OTP is cleared), but make sure the flow still commits atomically as before.

**Acceptance criteria.**
- Five wrong OTPs in a row → fifth returns 429 and the correct OTP afterwards is also rejected (410).
- Attempt counter persists across requests (check the column in the DB).
- A correct OTP within the limit still verifies and deducts stock exactly as before.

---

## ISSUE 6 — Rate limiting, security headers and request-parameter hardening

**Files:** `backend/package.json`, `backend/src/app.js`, `backend/src/routes/orders.js`

**Required changes.**
1. Add dependencies `express-rate-limit` and `helmet` to `backend/package.json`.
2. In `app.js`: `app.set('trust proxy', 1)` (the API runs behind Render's proxy), `app.use(helmet())`, and attach rate limiters:
   - `POST /api/users/login` and `POST /api/users/register`: 10 requests / 15 min / IP;
   - `POST /api/orders/:orderId/verify-otp`: 20 requests / 15 min / IP.
   Use a clear JSON message `{ status: 'fail', message: 'Too many requests, please try again later.' }` with status 429. Do not rate-limit `GET` product/address routes.
3. In `GET /api/orders/admin/all`: parse `page`/`limit` safely — `page >= 1` (default 1), `1 <= limit <= 100` (default 20), fall back to defaults on `NaN`; if `status` is provided and is not one of `pending_otp, verified, dispatched, delivered, rto` return `400` "Invalid status filter."
4. Keep CORS configuration as is.

**Acceptance criteria.**
- 11 rapid wrong logins from one IP → the 11th returns 429.
- `GET /api/orders/admin/all?limit=999999` returns at most 100 rows; `?page=abc` behaves like page 1; `?status=foo` returns 400.
- Normal browsing, login, checkout and OTP flows are unaffected.

---

## ISSUE 7 — `verify-otp`: possible deadlock and unguarded connection acquisition

**Files:** `backend/src/routes/orders.js`

**Problem.** (a) The query that locks product rows (`… FOR UPDATE OF p`) has no `ORDER BY`, so two transactions containing the same products in a different order can deadlock. (b) `const client = await pool.connect();` is outside the `try`, so a connection failure becomes an unhandled promise rejection (which `server.js` treats as fatal and shuts the server down).

**Required changes.**
1. Add `ORDER BY oi.product_id` to the items query that uses `FOR UPDATE OF p`.
2. Restructure so `pool.connect()` happens **inside** the `try`, declare `let client;` before it, and in `catch`/`finally` guard with `if (client)`. Behaviour of all existing validations, ROLLBACK/COMMIT paths and `client.release()` in `finally` must be preserved.

**Acceptance criteria.**
- Verification still works end to end (order → `verified`, stock decremented, response unchanged).
- Temporarily pointing `DATABASE_URL` to an unreachable host while the server is running makes the endpoint return a 500 JSON error instead of crashing the process.

---

## ISSUE 8 — Frontend API base URL, dev proxy and DB SSL are inconsistent with the README

**Files:** `frontend/src/api/index.js`, `frontend/vite.config.js`, `backend/src/config/db.js`, `backend/.env.example` (new), `README.md`

**Problem.**
- `api/index.js` hard-codes the production URL, although its comment mentions the Vite proxy and `VITE_API_URL`. The Vite proxy points at the production server too, so "local dev" silently talks to production.
- `db.js` always enables SSL with `rejectUnauthorized: false`, which fails against a plain local PostgreSQL.
- The README's `.env` example (`DB_HOST`, `DB_USER`, …) doesn't match `db.js` (`DATABASE_URL`).

**Required changes.**
1. `frontend/src/api/index.js`: 
   ```js
   const baseURL =
     import.meta.env.VITE_API_URL ||
     (import.meta.env.DEV ? '/api' : 'https://safe-cod-api.onrender.com/api');
   ```
   (so production keeps working even if `VITE_API_URL` is not set).
2. `frontend/vite.config.js`: proxy target for `/api` → `http://localhost:5000`.
3. `backend/src/config/db.js`: disable SSL only when `DATABASE_URL` points to `localhost`/`127.0.0.1`; otherwise keep `ssl: { rejectUnauthorized: false }`.
4. Create `backend/.env.example` with: `PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DEMO_OTP`, `OTP_EXPIRY_MINUTES` (placeholder values, no real secrets).
5. (README changes are covered in Issue 9.)

**Acceptance criteria.**
- `npm run dev` in `frontend` + `npm run dev` in `backend` against a local Postgres works end to end with no SSL error.
- A production build (`npm run build`) without `VITE_API_URL` still points at the Render URL.

---

## ISSUE 9 — README is inaccurate

**Files:** `README.md`, `frontend/README.md`

**Required changes.**
- Setup command: `psql … -f schema.sql` (the file is in the repo root, not `database/`); mention the `migrations/` folder and that existing databases should run the numbered migrations in order.
- `.env` section: use `DATABASE_URL=postgresql://user:password@localhost:5432/safe_cod` instead of `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`; point to `backend/.env.example`.
- Versions: React **19** (badge and "Tech Stack"), Vite **8** (badge), Tailwind 3, Express 4. Read `frontend/package.json` and `backend/package.json` to confirm.
- In "Run Development Servers", the backend URL should be `http://localhost:5000` (currently shows the Render URL).
- Update the descriptions affected by Issues 2, 3, 4 and 5 (prepaid orders are verified immediately; real password hashing; delivered prepaid orders also earn +10; OTP attempt limiting).
- The statistics paragraph ("over 80% of all online transactions", "RTO rates regularly exceed 30–40%"): **remove the exact percentages** and rephrase qualitatively (e.g. "COD is the dominant payment method and RTO rates are a major cost for sellers"), leaving an HTML comment `<!-- TODO(owner): add a cited source for COD/RTO statistics -->`.
- Add near the top: a **"Live Demo"** section with the placeholders `<LIVE_DEMO_URL>` and `<API_URL>`, a note that "the first request may take up to a minute because the free-tier server sleeps when idle", and a `<!-- TODO(owner): add 3–4 screenshots -->` comment.
- Leave `[Your Name]`, LinkedIn and GitHub URLs as clearly marked `<PLACEHOLDER>` values (the owner will fill them in). Do not invent personal details.
- Replace `frontend/README.md` (Vite template text) with a short, project-specific README (how to run, env var `VITE_API_URL`, build command).

**Acceptance criteria.** Following the README from scratch on a clean machine (clone → create DB → run schema → set env → install → run both servers → log in) works with no corrections.

---

# P2 — Nice to have (UX / completeness)

## ISSUE 10 — Cancel a pending order and resend the OTP

**Files:** `schema.sql`, `migrations/004_add_cancelled_status.sql` (new), `backend/src/routes/orders.js`, `frontend/src/api/index.js`, `frontend/src/components/OtpModal.jsx`, `frontend/src/components/OrderStatusBadge.jsx`, `frontend/src/pages/CheckoutPage.jsx`, `frontend/src/pages/MyOrdersPage.jsx`, `frontend/src/pages/AdminDashboardPage.jsx`, `schema.sql` (view)

**Problem.** An abandoned COD order stays `pending_otp` forever and permanently costs the customer −5 points. There is no way to cancel it, and an expired OTP says "request a new one" but there is no endpoint to do so. "Cancel order" in `OtpModal` only closes the modal.

**Required changes.**
1. **DB:** `ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'cancelled';` in its **own** migration file (this statement cannot run inside a transaction block). Add `'cancelled'` to the enum in `schema.sql`. In the view from Issue 4, change `total_orders` to `COUNT(*) FILTER (WHERE o.status IS NOT NULL AND o.status <> 'cancelled')` (cancelled orders must not affect the score or the totals).
2. **Backend (`orders.js`):**
   - `POST /api/orders/:orderId/cancel` (`protect`): owner only; inside a transaction with `SELECT … FOR UPDATE`; only allowed from `pending_otp` (else 409); sets status `cancelled`.
   - `POST /api/orders/:orderId/resend-otp` (`protect`): owner only; only for COD orders in `pending_otp` (else 409/400); generates a fresh OTP (`process.env.DEMO_OTP` if set, otherwise `crypto.randomInt(1000, 10000)`), stores the new hash + expiry, resets `otp_attempts` to 0; returns `_demo: { otp, expiresAt }` **only when `DEMO_OTP` is set**. Apply the same rate limiter as `verify-otp`.
   - Admin `allowedTransitions` gets `cancelled: []`.
3. **Frontend:**
   - `api/index.js`: `cancelOrder(orderId)`, `resendOtp(orderId)`.
   - `OtpModal`: add a "Resend OTP" button (calls a new `onResend` prop) and make "Cancel order" call a new `onCancel` prop (the parent calls `cancelOrder`, then navigates). Keep existing props working.
   - `MyOrdersPage`: for COD orders with status `pending_otp`, show **Verify now** (opens `OtpModal`, with `phoneNumber` from `useAuth()`) and **Cancel** buttons.
   - `OrderStatusBadge`: add a `cancelled` entry (grey/slate colours).
   - `AdminDashboardPage`: add `cancelled` to `NEXT_STATUSES` (`[]`), to the stats accumulator and to the filter tabs.

**Acceptance criteria.**
- A pending COD order can be cancelled from the modal and from My Orders; its status becomes Cancelled and the customer's score is no longer reduced by it.
- Resend OTP issues a new OTP; the old one stops working; the new one verifies the order.
- Cancelling a verified/dispatched order returns 409.

---

## ISSUE 11 — Risk score in the navbar/checkout is stale

**Files:** `frontend/src/context/AuthContext.jsx`, `frontend/src/pages/CheckoutPage.jsx`

**Problem.** `user.riskScore` is saved to `localStorage` at login and never refreshed; `refreshUser` exists but is never called. After an order is verified or marked RTO, the navbar and the "Your current risk score" card show an outdated value.

**Required changes.** After the user is re-hydrated from `localStorage` in `AuthContext`, call `getMe()` and merge `{ riskScore: Number(data.user.risk_score), isCodEligible: data.user.is_cod_eligible }` into the user via `refreshUser`-style logic (ignore errors silently). Also call it when `CheckoutPage` mounts and after a successful OTP verification. Be careful not to create an infinite re-render loop (use effects with correct dependencies; make `refreshUser` use a functional state update so it doesn't depend on a stale `user`).

**Acceptance criteria.** An admin marks a customer's order as RTO; after the customer reloads (or opens checkout) the navbar badge shows the lower score without logging out and in.

---

## ISSUE 12 — Admin dashboard stats only reflect the current page

**Files:** `backend/src/routes/orders.js`, `frontend/src/api/index.js`, `frontend/src/pages/AdminDashboardPage.jsx`

**Problem.** The stat cards and the "Live RTO Rate (this page)" banner are computed from the 15 orders currently loaded, which is misleading when there are more orders.

**Required changes.**
- Add `GET /api/orders/admin/stats` (`protect`, `restrictTo('admin')`) returning `{ total, pending_otp, verified, dispatched, delivered, rto, cancelled }` using one query: `SELECT status, COUNT(*) FROM orders GROUP BY status`. **Register this route before any `/:orderId/...` routes** and keep the response envelope.
- Add `getAdminStats()` to `api/index.js`; use it for the stat cards and the RTO-rate banner (label it "Overall RTO rate"); refresh the stats after a status change.
- Keep the table pagination/filters as they are.

**Acceptance criteria.** With more than 15 orders, the cards show true totals across all pages and the RTO percentage equals `rto / total` over all orders.

---

## ISSUE 13 — Inconsistent user shape between register and login

**Files:** `backend/src/routes/users.js`, `frontend/src/pages/RegisterPage.jsx`, `frontend/src/components/Navbar.jsx`, `frontend/src/pages/CheckoutPage.jsx`

**Problem.** `register` returns the raw DB row (`full_name`, `phone_number`) while `login` returns camelCase (`fullName`, `phoneNumber`, `riskScore`, `isCodEligible`). The frontend compensates with fallbacks like `user.fullName || user.full_name` and `user?.phone_number || user?.phoneNumber`.

**Required changes.** Make `register` return the same camelCase shape as `login` (`id, fullName, phoneNumber, role, riskScore: 100, isCodEligible: true`). Update `RegisterPage` to read the camelCase fields. Remove the snake_case fallbacks in `Navbar` and `CheckoutPage` (keep `GET /users/me` as is, but make sure `AuthContext` merges its values correctly).

**Acceptance criteria.** Register → navbar shows the full name and the 100 badge immediately; Login → same; checkout OTP modal shows the phone number in both cases.

---

# P3 — Polish (optional)

## ISSUE 14 — Navigation during render in Login/Register

**Files:** `frontend/src/pages/LoginPage.jsx`, `frontend/src/pages/RegisterPage.jsx`

**Problem.** `if (user) { navigate('/'); return null; }` calls `navigate()` while rendering (a React anti-pattern).

**Fix.** Replace with `if (user) return <Navigate to="/" replace />;` (import `Navigate` from `react-router-dom`). Hooks must still be called before this early return.

**Acceptance.** Visiting `/login` while logged in redirects to `/` with no console warnings.

---

## ISSUE 15 — Unused template files and broken favicon

**Files:** `frontend/index.html`, `frontend/src/App.css`, `frontend/src/assets/react.svg`, `frontend/src/assets/vite.svg`, `frontend/public/icons.svg`, `frontend/public/favicon.svg`

**Problem.** `index.html` references `/vite.svg`, which does not exist in `public/` (404). `App.css`, `react.svg`, `vite.svg` and `icons.svg` are unused Vite-template leftovers.

**Fix.**
- Delete the unused files after confirming with a repo-wide search that nothing imports them.
- Replace `public/favicon.svg` with a small shield icon matching the logo in `Navbar.jsx` (indigo→purple gradient, check mark) and point `index.html` to `/favicon.svg`.

**Acceptance.** No 404 for the favicon in the browser console; `npm run build` and `npm run lint` pass.

---

## ISSUE 16 — Automated tests (optional but valuable)

**Files:** `backend/package.json`, `backend/tests/*` (new)

**Add** Jest + Supertest with a separate test database (`TEST_DATABASE_URL`). Minimum tests:
1. **Risk view** — insert users/orders with the histories listed in Issue 4's acceptance criteria and assert scores and `is_cod_eligible`.
2. **Checkout** — blocked COD (score < 40) returns 403 and creates no order; prepaid creates a `verified` order and deducts stock.
3. **verify-otp** — success deducts stock; wrong OTP increments attempts; fifth wrong OTP returns 429; two **simultaneous** correct verifications for the same order result in exactly one success (the other returns 409) and stock is deducted once.
4. **Auth** — wrong password returns 401; correct password returns a token; `/admin/all` returns 403 for a customer.

Add `"test": "jest --runInBand"` to the backend scripts and document how to run it in the README.

---

# Suggested order of work

| Batch | Issues | Notes |
|---|---|---|
| 1 | **1, 2, 3** | The three P0 items. Issue 2 and Issue 7 both touch transaction code — do 2 first. |
| 2 | **4, 5, 7** | Database + `orders.js` changes. Migrations 001–003. |
| 3 | **6, 8, 9** | Hardening, config consistency, README. |
| 4 | **10–13** | Features and UX (migration 004 for Issue 10). |
| 5 | **14–16** | Polish and tests. |

# Deployment order (important — the production database already exists)

1. Run the new migrations **in numeric order against the production database** *before* deploying the new backend code (otherwise login/checkout will fail on missing columns).
2. Run `node scripts/set-password.js <adminPhone> "<chosen demo password>"` against the production DB (set `DATABASE_URL` to the production connection string locally for this one command, and never commit it).
3. Deploy the backend (Render), then the frontend (Vercel).
4. If the frontend uses `VITE_API_URL`, set it in Vercel's environment variables.
5. Run the verification script below against the **live** site.

# End-to-end verification script (run after all fixes)

1. Register a new customer → logged in, navbar score badge = **100**.
2. Add products to cart → checkout → choose district/town/block → **COD** → Place order → OTP modal.
3. Enter a **wrong OTP** → error + shake, **still logged in** (Issue 1). Enter `1234` → "Order Confirmed" → My Orders shows **Verified**; product stock decreased once.
4. Place a **prepaid** order → My Orders shows **Verified** immediately; stock decreased (Issue 2).
5. Log in as admin (password set via the script) → both orders visible with live risk scores → move one order to **Dispatched → RTO** → customer's score drops by 30.
6. Mark three COD orders for one customer as RTO → that customer's COD checkout shows the **COD Blocked** screen (score 10).
7. As that customer, place prepaid orders and have the admin mark them **Delivered** → after 3 deliveries the score is **40** and COD works again (Issue 4).
8. Try a wrong login password → error toast without page reload; try 11 rapid wrong logins → 429 (Issue 6).
9. Run `npm run lint` and `npm run build` in `frontend`; start the backend with a valid `DATABASE_URL` with no errors.
10. Report back: list every file changed, every migration created, and anything you could **not** verify.

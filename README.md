<div align="center">

# 🛡️ Safe-COD Risk Scoring & Verification Engine

### Eliminating COD Return-to-Origin Waste in Pakistani E-Commerce

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express.js-4-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)

*A full-stack PERN application demonstrating advanced relational database design, ACID-compliant transactions, and a dynamic SQL-powered risk engine — purpose-built for the Karachi e-commerce market.*

</div>

---

## 📌 The Problem: Pakistan's COD Crisis

Cash on Delivery dominates Pakistani e-commerce, accounting for over **80% of all online transactions**. While it drives adoption among customers who distrust digital payments, it comes at a steep operational cost: **Return-to-Origin (RTO) rates in Karachi regularly exceed 30–40%** for mid-tier sellers. Every RTO represents a round-trip courier fee, a restocking overhead, and an unsalvageable customer acquisition cost — all paid by the merchant with zero revenue received.

The root cause is structural. With no upfront payment commitment and no identity verification beyond a phone number, a segment of customers routinely places orders they never intend to receive. Existing platforms apply blanket COD policies, making no distinction between a loyal customer with 20 successful deliveries and a first-time user with a history of refusals. **Safe-COD solves this by treating order verification as a data engineering problem**, not a customer service one.

---

## 💡 The Solution: A Risk-First Verification Pipeline

Safe-COD intercepts every COD checkout request and routes it through a **dynamic Risk Scoring Engine** backed by a PostgreSQL VIEW. The engine calculates a weighted score (0–100) from the customer's entire COD order history — rewarding deliveries, penalising RTOs, and flagging ghost orders (pending_otp). Orders from customers below the **40-point COD eligibility threshold** are immediately blocked with a full breakdown of their score, and they are offered a prepaid fallback. Orders that pass are held in a `pending_otp` state until the customer completes a **WhatsApp OTP verification** (simulated; architecture is production-ready), at which point an ACID transaction simultaneously marks the order as `verified` and atomically deducts stock.

---

## ⚙️ Key Engineering Features

This project was architected to demonstrate depth in relational database design, backend systems, and transaction safety — skills evaluated in backend and full-stack engineering interviews.

### 🔷 ACID Transactions via Dedicated pg Client

The OTP verification endpoint (`POST /api/orders/:id/verify-otp`) is the system's most critical path. It executes three mutations that must either all succeed or all fail:

1. Validate the SHA-256 OTP hash and expiry timestamp
2. Update the order status from `pending_otp` → `verified`
3. Deduct `quantity` units from `products.stock_quantity` for every line item

This is implemented using a **dedicated connection** acquired via `pool.connect()` — not `pool.query()`. Using the pool's query shorthand would allow each statement to execute on a different underlying TCP connection, silently breaking the transaction context. The pattern is:

```sql
BEGIN;
  SELECT ... FROM orders WHERE id = $1 FOR UPDATE; -- lock the row
  UPDATE orders SET status = 'verified' WHERE id = $1;
  UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $3;
  -- PostgreSQL CHECK (stock_quantity >= 0) is the final atomic guardrail
COMMIT;  -- or ROLLBACK on any failure
```

The client is always released in a `finally` block, regardless of outcome, preventing connection pool exhaustion.

---

### 🔷 Advanced PostgreSQL Schema Design

#### Custom ENUM Types for State Machine Integrity
Rather than storing status as a free-text `VARCHAR` — which would allow any string to corrupt the order lifecycle — the schema defines a PostgreSQL `ENUM` type:

```sql
CREATE TYPE order_status AS ENUM (
    'pending_otp', 'verified', 'dispatched', 'delivered', 'rto'
);
```

The database engine itself rejects any `UPDATE` that attempts an invalid status string, eliminating an entire class of application-layer bugs.

#### Karachi-Localised Address Hierarchy (No ZIP Codes)
Karachi uses no reliable postal code system. Addresses are identified by a three-level administrative hierarchy. The schema implements this as a normalised cascade of lookup tables:

```
districts  ──< towns  ──< block_sectors  ──< addresses
```

`ON DELETE RESTRICT` foreign keys prevent orphaned address records if a parent administrative unit is deleted. The `addresses` table then adds free-text fields (`street_address`, `landmark`) for the specific delivery point. The `landmark` field deserves special mention: in dense Karachi neighbourhoods, "Near Noman Masjid, opposite Agha Superstore" is more useful to a courier than any formal address.

#### The Risk Score VIEW — SQL as the Business Logic Layer
The scoring algorithm lives entirely inside PostgreSQL as a `VIEW`, not in the Express application layer. This is a deliberate architectural choice: the database is the single source of truth for risk data, and the application cannot introduce drift by computing the score differently.

```sql
CREATE OR REPLACE VIEW customer_risk_scores AS
SELECT
    u.id AS user_id,
    LEAST(
        GREATEST(
            100
            + (COUNT(*) FILTER (WHERE o.status = 'rto')          * -30)
            + (COUNT(*) FILTER (WHERE o.status = 'delivered')    *  10)
            + (COUNT(*) FILTER (WHERE o.status = 'pending_otp')  *  -5),
            0   -- floor
        ),
        100     -- ceiling
    ) AS risk_score,
    CASE WHEN ... >= 40 THEN TRUE ELSE FALSE END AS is_cod_eligible
FROM users u
LEFT JOIN orders o ON o.user_id = u.id AND o.payment_method = 'cod'
WHERE u.role = 'customer'
GROUP BY u.id, u.phone_number, u.full_name;
```

The `LEFT JOIN` is critical: new customers with zero history score **100 by default**, meaning they are trusted until proven otherwise. Only COD orders count toward the score — prepaid orders prove nothing about COD intent.

The `orders` table also stores a `risk_score_snapshot` at the time of checkout. This creates an **immutable audit trail**: even as a customer's live score changes over time, the historical record shows exactly what score was evaluated for each order.

---

### 🔷 Concurrency Control with `SELECT ... FOR UPDATE`

A naive OTP verification flow has a race condition: two simultaneous HTTP requests for the same order could both read `status = 'pending_otp'`, both pass validation, and both attempt to deduct stock — resulting in double deduction and potentially a negative `stock_quantity`.

Safe-COD prevents this with a **pessimistic row-level lock**:

```sql
SELECT * FROM orders WHERE id = $1 FOR UPDATE;
```

The second concurrent transaction blocks at this statement until the first transaction commits or rolls back. PostgreSQL's `CHECK (stock_quantity >= 0)` constraint on the `products` table serves as an atomic, database-level backstop: even if the application-layer guard fails, the constraint violation will trigger the `ROLLBACK`.

---

### 🔷 Additional Backend Architecture Decisions

| Decision | Rationale |
|---|---|
| **Raw `pg` driver** (no ORM) | Full control over query execution plans; SQL skills are directly readable and evaluable |
| **UUID primary keys** (`gen_random_uuid()`) | Prevents sequential ID enumeration attacks on public API endpoints |
| **Price snapshot on `order_items`** | Product prices can change; order records must be immutable for accounting integrity |
| **SHA-256 OTP hashing** | OTPs are never stored in plain text; uses Node's built-in `crypto` module |
| **Centralised error handler** | PostgreSQL error codes (`23505`, `23514`, `23503`) are mapped to clean HTTP responses in a single middleware; routes contain no error-handling boilerplate |
| **`updated_at` trigger** | `BEFORE UPDATE` trigger on `users`, `products`, `orders` — the application cannot forget to update this field |
| **Status transition enforcement** | The admin PATCH endpoint validates allowed transitions (`verified → dispatched → delivered/rto`) at the application layer, mirroring business rules |

---

## 🏗️ Tech Stack

### Frontend
- **React 18** (Vite) — component-based UI with React Router v6 for client-side routing
- **Tailwind CSS v3** — utility-first styling with custom design tokens (glassmorphism, glow shadows, stagger animations)
- **Axios** — centralised API client with JWT request interceptor and global 401 handler
- **React Hot Toast** — non-blocking toast notifications

### Backend
- **Node.js 20 / Express.js 4** — RESTful API server with modular route structure
- **`pg` (node-postgres)** — raw PostgreSQL driver; no ORM
- **`jsonwebtoken`** — stateless JWT authentication with role-based route guards (`protect`, `restrictTo`)
- **`bcryptjs`** — password hashing
- **`dotenv`** — environment variable management

### Database
- **PostgreSQL 16** — primary data store
- Custom `ENUM` types, `CHECK` constraints, `UNIQUE` composite keys, `ON DELETE RESTRICT` foreign keys
- `customer_risk_scores` VIEW with weighted aggregate scoring
- `trigger_set_updated_at()` PL/pgSQL trigger function
- `pgcrypto` extension for UUID generation

---

## 🚀 Local Setup & Installation

**Prerequisites:** Node.js ≥ 18, PostgreSQL ≥ 14, `psql` CLI available in your PATH.

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/safe-cod.git
cd safe-cod
```

### 2. Database Setup

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE safe_cod;"

# Execute the schema: creates all tables, ENUMs, VIEW, triggers,
# and seeds Karachi address data + sample products
psql -U postgres -d safe_cod -f database/schema.sql
```

### 3. Backend Configuration

```bash
cd backend
cp .env.example .env
```

Open `.env` and fill in your values:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=safe_cod
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# Generate a strong secret:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your_64_char_secret_here
JWT_EXPIRES_IN=7d

DEMO_OTP=1234
OTP_EXPIRY_MINUTES=10
```

### 4. Install Dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 5. Run Development Servers

Open two terminal windows:

```bash
# Terminal 1 — Backend API (https://safe-cod-api.onrender.com)
cd backend
npm run dev

# Terminal 2 — Frontend (http://localhost:5173)
cd frontend
npm run dev
```

### 6. Demo Credentials

| Role | Phone | Password |
|------|-------|----------|
| Admin | `+923001234567` | *(any non-empty string)* |
| Customer | Register at `/register` | *(your choice)* |

> **Demo OTP:** `1234` (displayed in the verification modal for local testing)

---

## 📐 Database Schema Overview

```
districts ──< towns ──< block_sectors ──< addresses
                                               │
users ──────────────────────────────── orders ─┘
  │                                      │
  └──── customer_risk_scores (VIEW)      └──── order_items ──── products
```

---

## 🗺️ API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/users/register` | Public | Register customer |
| `POST` | `/api/users/login` | Public | Login → JWT + risk score |
| `GET` | `/api/users/me` | Customer | Profile + live risk stats |
| `GET` | `/api/products` | Public | Product catalog |
| `GET` | `/api/addresses/districts` | Public | Karachi districts |
| `GET` | `/api/addresses/districts/:id/towns` | Public | Towns in district |
| `GET` | `/api/addresses/towns/:id/block-sectors` | Public | Block/sectors in town |
| `POST` | `/api/checkout` | Customer | **Risk gate** → place order |
| `POST` | `/api/orders/:id/verify-otp` | Customer | **ACID tx** → verify + deduct stock |
| `GET` | `/api/orders` | Customer | Order history |
| `GET` | `/api/orders/admin/all` | Admin | All orders with live risk scores |
| `PATCH` | `/api/orders/:id/status` | Admin | Update order status |

---

## 🔮 Future Enhancements

- **WhatsApp Business API Integration** — Replace the hardcoded demo OTP with a live Twilio or Meta Cloud API integration, sending a templated OTP message to the customer's registered number at checkout
- **Real-Time Admin Dashboard** — WebSocket-based order feed using `pg_notify` / `LISTEN` so the admin dashboard updates without polling when new orders arrive
- **ML-Augmented Risk Scoring** — Export historical order data to a Python micro-service and augment the PostgreSQL VIEW score with a machine-learning prediction layer (logistic regression on delivery address, time-of-day, product category)
- **Courier API Webhooks** — Integrate with TCS or Leopards Courier APIs to automatically update order status to `delivered` or `rto` based on webhook callbacks, removing the need for manual admin updates
- **Multi-Seller Architecture** — Extend the schema with a `sellers` table and row-level security policies so each seller sees only their own orders and risk analytics
- **Redis OTP Cache** — Replace database-stored OTP hashes with a Redis key with a TTL, reducing write load on the `orders` table for high-traffic checkout periods

---

## 👨‍💻 Author

**[Your Name]**
Final-Year Software Engineering Student

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=flat-square&logo=linkedin)](https://linkedin.com/in/your-profile)
[![GitHub](https://img.shields.io/badge/GitHub-Follow-181717?style=flat-square&logo=github)](https://github.com/your-username)

---

<div align="center">
  <sub>Built with deliberate intent to demonstrate production-quality backend engineering — not just to ship features, but to understand <em>why</em> they work.</sub>
</div>

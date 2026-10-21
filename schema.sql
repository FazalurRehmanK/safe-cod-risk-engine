-- =============================================================================
-- Safe-COD Risk Scoring & Verification Engine
-- =============================================================================
-- SECTION 1: EXTENSIONS
-- =============================================================================

-- pgcrypto gives us gen_random_uuid() for UUID primary keys.
-- This is far better than SERIAL for distributed systems and obfuscates
-- sequential IDs from the public API.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- SECTION 2: CUSTOM ENUM TYPES
-- =============================================================================

-- Order lifecycle. Every COD order starts at pending_otp (awaiting phone
-- verification) and moves forward. rto is the "Return-To-Origin" state —
-- the core problem this platform is built to minimize.
CREATE TYPE order_status AS ENUM (
    'pending_otp',   -- Order placed, awaiting WhatsApp OTP confirmation
    'verified',      -- OTP confirmed, order is live and ready to dispatch
    'dispatched',    -- Handed off to the courier
    'delivered',     -- Successfully received by customer — good outcome
    'rto'            -- Returned to origin — bad outcome, penalizes risk score
);

-- Payment method. Determines whether risk check is triggered at checkout.
CREATE TYPE payment_method AS ENUM (
    'cod',           -- Cash on Delivery — triggers the Risk Scoring Engine
    'prepaid'        -- Card/JazzCash/Easypaisa — always allowed through
);

-- User roles for the admin dashboard protected routes.
CREATE TYPE user_role AS ENUM (
    'customer',
    'admin'
);


-- =============================================================================
-- SECTION 3: KARACHI-LOCALIZED ADDRESS HIERARCHY
-- =============================================================================
-- Karachi does not use a reliable ZIP code system. Addresses are instead
-- identified by a 3-level administrative hierarchy:
--   District  -->  Town  -->  Block / Sector
--
-- Example: District East --> Gulshan-e-Iqbal Town --> Block 3
--
-- This is a normalized lookup structure (master data). Orders will reference
-- a specific block_sector_id. We populate this with seed data.
-- =============================================================================

-- Level 1: Top-level administrative districts of Karachi.
CREATE TABLE IF NOT EXISTS districts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Level 2: Towns within a district.
-- ON DELETE RESTRICT ensures we cannot accidentally delete a district
-- that has towns referencing it.
CREATE TABLE IF NOT EXISTS towns (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    district_id UUID NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
    name        VARCHAR(150) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- A town name must be unique within its parent district.
    UNIQUE (district_id, name)
);

-- Level 3: The most granular address unit — a block or sector within a town.
-- This is what a customer selects when entering their address.
CREATE TABLE IF NOT EXISTS block_sectors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    town_id     UUID NOT NULL REFERENCES towns(id) ON DELETE RESTRICT,
    name        VARCHAR(200) NOT NULL,
    -- Lat/lng for future courier routing integrations (nullable for now).
    latitude    DECIMAL(9, 6),
    longitude   DECIMAL(9, 6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (town_id, name)
);

-- The actual customer-entered address. This is linked to an order.
-- By separating it from the order itself, one saved address can be
-- reused across multiple orders (future feature).
CREATE TABLE IF NOT EXISTS addresses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_sector_id UUID NOT NULL REFERENCES block_sectors(id) ON DELETE RESTRICT,
    -- Free-text fields for the specific details within the block/sector.
    street_address  VARCHAR(300) NOT NULL,  -- e.g., "Plot 45, Street 7"
    apartment       VARCHAR(100),           -- e.g., "Flat 3B" (optional)
    landmark        VARCHAR(200),           -- e.g., "Near Noman Masjid" — critical in Karachi
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 4: CORE APPLICATION TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1: USERS
-- Phone number is the primary business identifier in Pakistan.
-- We use it as a UNIQUE constraint — not the primary key — to allow UUIDs
-- as stable identifiers for foreign key relationships.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       VARCHAR(200) NOT NULL,
    -- Pakistani mobile numbers: 03XX-XXXXXXX (11 digits).
    -- Stored in E.164 format: +92XXXXXXXXXX (13 chars).
    phone_number    VARCHAR(15) NOT NULL UNIQUE,
    email           VARCHAR(254) UNIQUE,                    -- Optional
    role            user_role NOT NULL DEFAULT 'customer',
    -- bcrypt hash (cost 12). Never returned in API responses or logs.
    -- NULL means the user was created before password auth was added;
    -- run scripts/set-password.js or re-register to set it.
    password_hash   VARCHAR(100),
    -- Soft-delete: set to false to ban high-risk users without losing history.
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on phone_number for fast lookups at checkout (very frequent query).
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);


-- -----------------------------------------------------------------------------
-- 4.2: PRODUCTS
-- Simple product catalog with stock management.
-- Stock deduction is a critical ACID operation in the OTP verification flow.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(300) NOT NULL,
    description     TEXT,
    price           NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    -- stock_quantity must never go negative. We enforce this at the
    -- PostgreSQL level as a final safety net (application logic will
    -- also check before attempting the deduction).
    stock_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    image_url       TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- 4.3: ORDERS
-- The central table. An order belongs to one user and one delivery address.
-- The payment_method column determines whether the risk engine is invoked.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    address_id          UUID NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
    status              order_status NOT NULL DEFAULT 'pending_otp',
    payment_method      payment_method NOT NULL DEFAULT 'cod',
    -- Denormalized total for fast reporting (recalculated from order_items on insert).
    total_amount        NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    -- OTP fields. The OTP is hashed before storage (never store plain text).
    -- In production, this would be generated and sent via WhatsApp Business API.
    otp_hash            VARCHAR(64),      -- SHA-256 hash of the 6-digit OTP
    otp_expires_at      TIMESTAMPTZ,      -- OTPs expire after 10 minutes
    -- The risk score SNAPSHOT at the time of order placement.
    -- We store this because the live score can change, but we want to
    -- preserve what score was evaluated for this specific order for auditing.
    risk_score_snapshot INTEGER,
    notes               TEXT,             -- e.g., "Leave at gate"
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes to accelerate the most common admin dashboard queries.
CREATE INDEX IF NOT EXISTS idx_orders_user_id    ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);


-- -----------------------------------------------------------------------------
-- 4.4: ORDER ITEMS
-- The line items of an order. Uses a composite unique constraint to prevent
-- duplicate product entries on the same order.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    -- Price snapshot: stores the price at the time of purchase.
    -- This is crucial — product prices can change, but an order's price must
    -- remain fixed as a historical record.
    unit_price  NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    UNIQUE (order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);


-- =============================================================================
-- SECTION 5: THE RISK SCORING ENGINE (VIEW)
-- =============================================================================
-- This VIEW calculates a dynamic risk score (0-100) for every customer
-- based on their complete order history. It is called at checkout to decide
-- whether a COD order is allowed to proceed.
--
-- SCORING ALGORITHM:
--   Base Score     : 100 points (everyone starts as trusted)
--   RTO Penalty    : -30 points per 'rto' order      (high-risk behavior)
--   Pending Penalty:  -5 points per 'pending_otp'    (indecisive/ghost orders)
--   Delivered Bonus: +10 points per 'delivered'      (proven good behavior)
--   Floor          :   0 (score cannot go below zero)
--   Ceiling        : 100 (score cannot exceed 100)
--   COD Threshold  :  >= 40 to be eligible for COD
--
-- EXAMPLE A: 3 RTOs, 0 deliveries
--   100 + (3 * -30) = 10  -->  BLOCKED from COD
--
-- EXAMPLE B: 1 RTO, 4 deliveries
--   100 + (1 * -30) + (4 * +10) = 110  -->  CLAMPED to 100  (ALLOWED)
-- =============================================================================

CREATE OR REPLACE VIEW customer_risk_scores AS
SELECT
    u.id                                              AS user_id,
    u.phone_number,
    u.full_name,

    -- Count each order outcome for transparency in the admin dashboard.
    COUNT(*) FILTER (WHERE o.status = 'delivered')    AS total_delivered,
    COUNT(*) FILTER (WHERE o.status = 'rto')          AS total_rto,
    COUNT(*) FILTER (WHERE o.status = 'pending_otp')  AS total_pending,
    COUNT(*) FILTER (WHERE o.status IS NOT NULL)      AS total_orders,

    -- Core risk score calculation.
    -- GREATEST(..., 0) enforces the floor at 0.
    -- LEAST(..., 100)  enforces the ceiling at 100.
    LEAST(
        GREATEST(
            100
            + (COUNT(*) FILTER (WHERE o.status = 'rto')          * -30)
            + (COUNT(*) FILTER (WHERE o.status = 'delivered')    *  10)
            + (COUNT(*) FILTER (WHERE o.status = 'pending_otp')  *  -5),
            0   -- Floor: score cannot be negative
        ),
        100     -- Ceiling: score cannot exceed 100
    )                                                 AS risk_score,

    -- Derived COD eligibility flag for direct use in application logic.
    CASE
        WHEN LEAST(
            GREATEST(
                100
                + (COUNT(*) FILTER (WHERE o.status = 'rto')          * -30)
                + (COUNT(*) FILTER (WHERE o.status = 'delivered')    *  10)
                + (COUNT(*) FILTER (WHERE o.status = 'pending_otp')  *  -5),
                0
            ),
            100
        ) >= 40 THEN TRUE
        ELSE FALSE
    END                                               AS is_cod_eligible

FROM users u
-- LEFT JOIN ensures users with ZERO orders still appear in the view.
-- A brand-new customer has no history and scores 100 (maximally trusted).
LEFT JOIN orders o
    ON o.user_id = u.id
   AND o.payment_method = 'cod'  -- Only COD orders affect the risk score.
                                 -- Prepaid orders prove nothing about COD intent.
WHERE u.role = 'customer'
GROUP BY u.id, u.phone_number, u.full_name;


-- =============================================================================
-- SECTION 6: UTILITY — UPDATED_AT AUTO-TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_updated_at_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_products
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_orders
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- SECTION 7: SEED DATA — KARACHI ADDRESS HIERARCHY
-- =============================================================================

-- ---- Districts ----
INSERT INTO districts (name) VALUES
    ('District East'),
    ('District West'),
    ('District Central'),
    ('District South'),
    ('District Malir'),
    ('District Korangi'),
    ('Keamari District')
ON CONFLICT (name) DO NOTHING;


-- ---- Towns ----
INSERT INTO towns (district_id, name)
SELECT d.id, t.name
FROM (VALUES
    ('District East',     'Gulshan-e-Iqbal Town'),
    ('District East',     'Jamshed Town'),
    ('District East',     'Liaquatabad Town'),
    ('District East',     'Landhi Town'),
    ('District West',     'Baldia Town'),
    ('District West',     'SITE Town'),
    ('District West',     'Orangi Town'),
    ('District West',     'Harbour Town'),
    ('District Central',  'New Karachi Town'),
    ('District Central',  'Gulberg Town'),
    ('District Central',  'North Nazimabad Town'),
    ('District Central',  'Nazimabad Town'),
    ('District South',    'Saddar Town'),
    ('District South',    'Lyari Town'),
    ('District South',    'Clifton'),
    ('District South',    'Defence Housing Authority (DHA)'),
    ('District Malir',    'Malir Town'),
    ('District Malir',    'Bin Qasim Town'),
    ('District Korangi',  'Korangi Town'),
    ('District Korangi',  'Shah Faisal Town'),
    ('Keamari District',  'Keamari Town'),
    ('Keamari District',  'Manghopir Town')
) AS t(district_name, name)
JOIN districts d ON d.name = t.district_name
ON CONFLICT (district_id, name) DO NOTHING;


-- ---- Blocks / Sectors ----
INSERT INTO block_sectors (town_id, name)
SELECT t.id, b.name
FROM (VALUES
    -- Gulshan-e-Iqbal
    ('Gulshan-e-Iqbal Town', 'Block 1'),
    ('Gulshan-e-Iqbal Town', 'Block 2'),
    ('Gulshan-e-Iqbal Town', 'Block 3'),
    ('Gulshan-e-Iqbal Town', 'Block 4'),
    ('Gulshan-e-Iqbal Town', 'Block 5'),
    ('Gulshan-e-Iqbal Town', 'Block 6'),
    ('Gulshan-e-Iqbal Town', 'Block 7'),
    ('Gulshan-e-Iqbal Town', 'Block 10A'),
    ('Gulshan-e-Iqbal Town', 'Block 13-D'),
    -- DHA
    ('Defence Housing Authority (DHA)', 'Phase 1'),
    ('Defence Housing Authority (DHA)', 'Phase 2'),
    ('Defence Housing Authority (DHA)', 'Phase 4'),
    ('Defence Housing Authority (DHA)', 'Phase 5'),
    ('Defence Housing Authority (DHA)', 'Phase 6'),
    ('Defence Housing Authority (DHA)', 'Phase 8'),
    -- Clifton
    ('Clifton', 'Block 1'),
    ('Clifton', 'Block 2'),
    ('Clifton', 'Block 3'),
    ('Clifton', 'Block 4'),
    ('Clifton', 'Block 5'),
    ('Clifton', 'Block 8'),
    ('Clifton', 'Block 9'),
    -- North Nazimabad
    ('North Nazimabad Town', 'Block A'),
    ('North Nazimabad Town', 'Block B'),
    ('North Nazimabad Town', 'Block C'),
    ('North Nazimabad Town', 'Block D'),
    ('North Nazimabad Town', 'Block E'),
    ('North Nazimabad Town', 'Block F'),
    ('North Nazimabad Town', 'Block H'),
    ('North Nazimabad Town', 'Block K'),
    ('North Nazimabad Town', 'Block L'),
    -- Saddar
    ('Saddar Town', 'Saddar Bazaar'),
    ('Saddar Town', 'Garden'),
    ('Saddar Town', 'Soldier Bazaar'),
    ('Saddar Town', 'Ranchore Line'),
    -- Orangi
    ('Orangi Town', 'Sector 1'),
    ('Orangi Town', 'Sector 5'),
    ('Orangi Town', 'Sector 10'),
    ('Orangi Town', 'Sector 11/2'),
    -- Shah Faisal
    ('Shah Faisal Town', 'Colony 1'),
    ('Shah Faisal Town', 'Colony 2'),
    ('Shah Faisal Town', 'Colony 3')
) AS b(town_name, name)
JOIN towns t ON t.name = b.town_name
ON CONFLICT (town_id, name) DO NOTHING;


-- ---- Sample Products ----
INSERT INTO products (name, description, price, stock_quantity, image_url) VALUES
    (
        'Karachi Lawn Suit (Summer)',
        'Premium 3-piece unstitched lawn suit. Perfect for the Karachi summer.',
        2500.00, 50,
        'https://placehold.co/400x400/e91e63/ffffff?text=Lawn+Suit'
    ),
    (
        'Desi Ghee (1kg)',
        'Pure and natural desi ghee from local farms. No additives.',
        1800.00, 100,
        'https://placehold.co/400x400/ff9800/ffffff?text=Desi+Ghee'
    ),
    (
        'Wireless Earbuds',
        'High-quality wireless earbuds with 24-hour battery life.',
        3500.00, 30,
        'https://placehold.co/400x400/2196f3/ffffff?text=Earbuds'
    ),
    (
        'Shan Biryani Masala (Pack of 6)',
        'Authentic Shan biryani masala, the Karachi kitchen staple.',
        750.00, 200,
        'https://placehold.co/400x400/4caf50/ffffff?text=Biryani+Masala'
    ),
    (
        'Smartphone Tempered Glass (Pack of 5)',
        'Universal 6.5" tempered glass screen protectors.',
        400.00, 500,
        'https://placehold.co/400x400/9c27b0/ffffff?text=Tempered+Glass'
    )
ON CONFLICT DO NOTHING;


-- ---- Admin User ----
INSERT INTO users (full_name, phone_number, email, role) VALUES
    ('Admin User', '+923001234567', 'admin@safecod.pk', 'admin')
ON CONFLICT (phone_number) DO NOTHING;


-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
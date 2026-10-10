// =============================================================================
// src/config/db.js
// PostgreSQL Connection Pool
// =============================================================================
// We use a Pool (not a single Client) because Express handles many concurrent
// requests. The pool manages a set of reusable connections, so we don't pay
// the TCP handshake cost on every request.
//
// IMPORTANT: For ACID transactions, you must call pool.connect() to get a
// dedicated client from the pool. A pool.query() call can use a different
// connection each time, which would break a transaction.
// =============================================================================

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Max connections in the pool. Default is 10.
  // Tune based on your PostgreSQL max_connections setting.
  max: 10,
  idleTimeoutMillis: 30000,
  // How long (ms) to wait for a client when the pool is exhausted.
  connectionTimeoutMillis: 2000,
});

// Verify the connection on startup. Fail fast — don't let the server boot
// silently with a broken DB connection.
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌  Failed to connect to PostgreSQL:', err.message);
    process.exit(1);
  }
  console.log('✅  PostgreSQL connected successfully.');
  release();
});

module.exports = pool;

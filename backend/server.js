// =============================================================================
// server.js
// HTTP Server Entry Point
// =============================================================================
// We keep this separate from app.js so that app.js can be imported cleanly
// in tests without starting an actual server.
// =============================================================================

require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`\n🚀  Safe-COD API running on http://localhost:${PORT}`);
  console.log(`📊  Environment : ${process.env.NODE_ENV}`);
  console.log(`🔑  JWT Expiry  : ${process.env.JWT_EXPIRES_IN}`);
  console.log(`🏥  Health      : http://localhost:${PORT}/api/health\n`);
});

// Handle unhandled promise rejections (e.g., DB query errors not caught by async handlers).
process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION! Shutting down gracefully...', err.name, err.message);
  server.close(() => process.exit(1));
});

// Handle SIGTERM for clean shutdown in production/Docker environments.
process.on('SIGTERM', () => {
  console.log('👋  SIGTERM received. Closing HTTP server gracefully.');
  server.close(() => console.log('Process terminated.'));
});

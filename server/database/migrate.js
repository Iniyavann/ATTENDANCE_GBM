/**
 * Standalone migration runner.
 * The server already runs migrations automatically on startup, but this
 * lets you initialize (or re-check) the database without starting the
 * whole app - handy right after cloning the project.
 *
 * Usage: npm run migrate
 */
require('dotenv').config();
require('./db'); // requiring this file runs migrate() as a side effect
console.log('Database is ready.');

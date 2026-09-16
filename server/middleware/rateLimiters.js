const rateLimit = require('express-rate-limit');

// Slows down admin passcode guessing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' }
});

// Slows down brute-forcing employee IDs or spamming attendance/location checks.
const publicPortalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' }
});

module.exports = { loginLimiter, publicPortalLimiter };

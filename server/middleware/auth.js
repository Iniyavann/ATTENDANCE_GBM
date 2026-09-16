const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'gbm_token';

function signToken(role = 'admin') {
  return jwt.sign(
    { role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Protects admin-only routes. Never trusts anything from the client except
// a valid, signed token - there is no "isAdmin" flag anyone can fake.
function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!['admin', 'owner'].includes(payload.role)) throw new Error('bad role');
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}

function requireOwner(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'owner') throw new Error('bad role');
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Owner access required.' });
  }
}

module.exports = { COOKIE_NAME, signToken, setAuthCookie, clearAuthCookie, requireAdmin, requireOwner };

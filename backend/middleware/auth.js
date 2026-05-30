function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token =
    req.headers['x-admin-token'] ||
    (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

  const adminToken = process.env.ADMIN_TOKEN || 'enjoyment-admin-token';

  if (token === adminToken) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { requireAuth };

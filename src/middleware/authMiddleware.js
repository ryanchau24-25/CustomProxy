function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
}

module.exports = {
  requireLogin,
  requireAdmin,
};

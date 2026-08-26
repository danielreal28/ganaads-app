const jwt = require('jsonwebtoken');
const { pool } = require('../db');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No has iniciado sesión.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    req.isAdmin = !!payload.isAdmin;
    // Actualiza la ultima actividad sin bloquear la respuesta (fire and forget)
    pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [req.userId]).catch(() => {});
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión de nuevo.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'No tienes permisos de administrador.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };

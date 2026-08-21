const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const POINTS_PER_USDT = parseInt(process.env.POINTS_PER_USDT || '1000', 10);

// GET /api/user/me - datos del usuario actual + resumen de referidos
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, email, referral_code, balance_points, is_admin, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const user = userResult.rows[0];

    const referralsResult = await pool.query(
      `SELECT email, referral_bonus_paid, created_at
       FROM users WHERE referred_by = $1 ORDER BY created_at DESC`,
      [req.userId]
    );

    res.json({
      ...user,
      balance_usdt: (user.balance_points / POINTS_PER_USDT).toFixed(2),
      referrals: referralsResult.rows,
      referral_count: referralsResult.rows.length,
    });
  } catch (err) {
    console.error('Error en /user/me:', err);
    res.status(500).json({ error: 'No se pudo cargar tu información.' });
  }
});

module.exports = router;

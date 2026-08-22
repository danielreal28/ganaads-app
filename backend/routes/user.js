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

    // Cuenta los anuncios vistos SOLO desde el último retiro solicitado
    // (el contador se reinicia en 0 cada vez que el usuario pide un retiro).
    const lastWithdrawalResult = await pool.query(
      `SELECT COALESCE(MAX(requested_at), '1970-01-01') AS last_withdrawal_at
       FROM withdrawals WHERE user_id = $1`,
      [req.userId]
    );
    const lastWithdrawalAt = lastWithdrawalResult.rows[0].last_withdrawal_at;

    const viewsSinceResult = await pool.query(
      `SELECT COUNT(*) FROM ad_views WHERE user_id = $1 AND viewed_at > $2`,
      [req.userId, lastWithdrawalAt]
    );
    const adViewsSinceWithdrawal = parseInt(viewsSinceResult.rows[0].count, 10);

    res.json({
      ...user,
      balance_usdt: (user.balance_points / POINTS_PER_USDT).toFixed(2),
      referrals: referralsResult.rows,
      referral_count: referralsResult.rows.length,
      adViewsSinceWithdrawal,
    });
  } catch (err) {
    console.error('Error en /user/me:', err);
    res.status(500).json({ error: 'No se pudo cargar tu información.' });
  }
});

module.exports = router;

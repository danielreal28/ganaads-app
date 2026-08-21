const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const POINTS_PER_AD = parseInt(process.env.POINTS_PER_AD || '10', 10);
const POINTS_REFERRAL_BONUS = parseInt(process.env.POINTS_REFERRAL_BONUS || '500', 10);

// POST /api/ads/view
// Se llama DESPUÉS de que el anuncio terminó de reproducirse completo en el frontend.
router.post('/view', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Suma los puntos por ver el anuncio
    await client.query(
      'INSERT INTO ad_views (user_id, points_earned) VALUES ($1, $2)',
      [req.userId, POINTS_PER_AD]
    );

    const updated = await client.query(
      `UPDATE users SET balance_points = balance_points + $1
       WHERE id = $2
       RETURNING id, referred_by, referral_bonus_paid, balance_points`,
      [POINTS_PER_AD, req.userId]
    );

    const user = updated.rows[0];
    let bonusAwarded = false;

    // 2. Si es su PRIMER anuncio visto y alguien lo invitó, se paga el bono ÚNICO
    //    al que lo invitó (no en cascada: el que invitó a ese, no recibe nada extra).
    if (user.referred_by && !user.referral_bonus_paid) {
      const countResult = await client.query(
        'SELECT COUNT(*) FROM ad_views WHERE user_id = $1',
        [req.userId]
      );
      const totalViews = parseInt(countResult.rows[0].count, 10);

      if (totalViews === 1) {
        await client.query(
          'UPDATE users SET balance_points = balance_points + $1 WHERE id = $2',
          [POINTS_REFERRAL_BONUS, user.referred_by]
        );
        await client.query(
          'UPDATE users SET referral_bonus_paid = TRUE WHERE id = $1',
          [req.userId]
        );
        bonusAwarded = true;
      }
    }

    await client.query('COMMIT');
    res.json({
      pointsEarned: POINTS_PER_AD,
      newBalance: user.balance_points,
      referralBonusTriggered: bonusAwarded,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en /ads/view:', err);
    res.status(500).json({ error: 'No se pudo registrar la vista del anuncio.' });
  } finally {
    client.release();
  }
});

// GET /api/ads/history - últimas vistas del usuario
router.get('/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT points_earned, viewed_at FROM ad_views WHERE user_id = $1 ORDER BY viewed_at DESC LIMIT 20',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /ads/history:', err);
    res.status(500).json({ error: 'No se pudo cargar el historial.' });
  }
});

module.exports = router;

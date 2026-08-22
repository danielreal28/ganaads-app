const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getCurrentPointsPerAd } = require('../pointsCalculator');

const router = express.Router();

const POINTS_REFERRAL_BONUS = parseInt(process.env.POINTS_REFERRAL_BONUS || '500', 10);
const MAX_ADS_PER_DAY = parseInt(process.env.MAX_ADS_PER_DAY || '50', 10);
const MIN_SECONDS_BETWEEN_ADS = parseInt(process.env.MIN_SECONDS_BETWEEN_ADS || '20', 10);

// POST /api/ads/view
// Se llama DESPUÉS de que el anuncio terminó de reproducirse completo en el frontend.
router.post('/view', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Puntos por anuncio calculados dinámicamente según el RPM real
    // configurado por el admin, manteniendo siempre el margen definido.
    const POINTS_PER_AD = await getCurrentPointsPerAd(pool);

    // --- Protección contra fraude / abuso ---

    // 1. No permitir ver anuncios demasiado seguido (evita scripts automatizados)
    const lastViewResult = await client.query(
      `SELECT viewed_at FROM ad_views WHERE user_id = $1
       ORDER BY viewed_at DESC LIMIT 1`,
      [req.userId]
    );
    if (lastViewResult.rows.length > 0) {
      const secondsSinceLast =
        (Date.now() - new Date(lastViewResult.rows[0].viewed_at).getTime()) / 1000;
      if (secondsSinceLast < MIN_SECONDS_BETWEEN_ADS) {
        await client.query('ROLLBACK');
        return res.status(429).json({
          error: `Espera ${Math.ceil(MIN_SECONDS_BETWEEN_ADS - secondsSinceLast)} segundos antes de ver otro anuncio.`,
        });
      }
    }

    // 2. Límite diario de anuncios por usuario (evita vaciar la cuenta de AdSense)
    const todayCountResult = await client.query(
      `SELECT COUNT(*) FROM ad_views
       WHERE user_id = $1 AND viewed_at >= CURRENT_DATE`,
      [req.userId]
    );
    const todayCount = parseInt(todayCountResult.rows[0].count, 10);
    if (todayCount >= MAX_ADS_PER_DAY) {
      await client.query('ROLLBACK');
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);
      return res.status(429).json({
        error: `Alcanzaste el límite de ${MAX_ADS_PER_DAY} anuncios por día.`,
        resetAt: tomorrow.toISOString(),
      });
    }

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

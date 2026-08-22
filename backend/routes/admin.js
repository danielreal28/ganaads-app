const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getCurrentPointsPerAd, MARGIN_PERCENT, FALLBACK_RPM_USDT } = require('../pointsCalculator');

const router = express.Router();

// GET /api/admin/stats - solo administradores
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const usersResult = await pool.query('SELECT COUNT(*) FROM users');
    const pendingResult = await pool.query(
      "SELECT COUNT(*) FROM withdrawals WHERE status = 'pending'"
    );
    const paidResult = await pool.query(
      "SELECT COALESCE(SUM(amount_usdt), 0) AS total FROM withdrawals WHERE status = 'approved'"
    );

    res.json({
      totalUsers: parseInt(usersResult.rows[0].count, 10),
      pendingWithdrawals: parseInt(pendingResult.rows[0].count, 10),
      totalPaidUsdt: parseFloat(paidResult.rows[0].total).toFixed(2),
    });
  } catch (err) {
    console.error('Error en /admin/stats:', err);
    res.status(500).json({ error: 'No se pudieron cargar las estadísticas.' });
  }
});

// GET /api/admin/settings - ver el RPM actual y los puntos que se están dando
router.get('/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'current_rpm_usdt'"
    );
    const currentRpmUsdt = result.rows.length > 0 ? parseFloat(result.rows[0].value) : null;
    const currentPointsPerAd = await getCurrentPointsPerAd(pool);

    res.json({
      currentRpmUsdt,
      fallbackRpmUsdt: FALLBACK_RPM_USDT,
      marginPercent: MARGIN_PERCENT,
      currentPointsPerAd,
    });
  } catch (err) {
    console.error('Error en /admin/settings GET:', err);
    res.status(500).json({ error: 'No se pudo cargar la configuración.' });
  }
});

// POST /api/admin/settings - actualizar el RPM real reportado por AdSense
router.post('/settings', requireAuth, requireAdmin, async (req, res) => {
  const { rpmUsdt } = req.body;
  const value = parseFloat(rpmUsdt);

  if (isNaN(value) || value < 0) {
    return res.status(400).json({ error: 'El RPM debe ser un número válido mayor o igual a 0.' });
  }

  try {
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('current_rpm_usdt', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [value.toString()]
    );

    const newPointsPerAd = await getCurrentPointsPerAd(pool);
    res.json({ ok: true, currentRpmUsdt: value, newPointsPerAd });
  } catch (err) {
    console.error('Error en /admin/settings POST:', err);
    res.status(500).json({ error: 'No se pudo guardar el RPM.' });
  }
});

module.exports = router;

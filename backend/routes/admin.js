const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

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

module.exports = router;

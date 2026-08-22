const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const POINTS_PER_USDT = parseInt(process.env.POINTS_PER_USDT || '1000', 10);
const MIN_WITHDRAWAL_USDT = parseFloat(process.env.MIN_WITHDRAWAL_USDT || '5');

// POST /api/withdrawals/request - el usuario pide un retiro
router.post('/request', requireAuth, async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress || walletAddress.trim().length < 5) {
    return res.status(400).json({ error: 'Debes indicar una dirección de billetera USDT válida.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT balance_points FROM users WHERE id = $1 FOR UPDATE',
      [req.userId]
    );
    const balancePoints = userResult.rows[0].balance_points;
    const balanceUsdt = balancePoints / POINTS_PER_USDT;

    if (balanceUsdt < MIN_WITHDRAWAL_USDT) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Necesitas al menos ${MIN_WITHDRAWAL_USDT} USDT para retirar. Tienes ${balanceUsdt.toFixed(2)} USDT.`,
      });
    }

    // Se retira TODO el saldo disponible. Se descuenta ya (queda "reservado")
    // para que el usuario no pueda gastarlo dos veces mientras esperas revisarlo.
    await client.query(
      'UPDATE users SET balance_points = 0 WHERE id = $1',
      [req.userId]
    );

    const withdrawal = await client.query(
      `INSERT INTO withdrawals (user_id, points_spent, amount_usdt, wallet_address, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, amount_usdt, status, requested_at`,
      [req.userId, balancePoints, balanceUsdt.toFixed(4), walletAddress.trim()]
    );

    await client.query('COMMIT');
    res.status(201).json(withdrawal.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en /withdrawals/request:', err);
    res.status(500).json({ error: 'No se pudo procesar la solicitud de retiro.' });
  } finally {
    client.release();
  }
});

// GET /api/withdrawals/mine - historial de retiros del usuario
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, amount_usdt, wallet_address, status, requested_at, processed_at
       FROM withdrawals WHERE user_id = $1 ORDER BY requested_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /withdrawals/mine:', err);
    res.status(500).json({ error: 'No se pudo cargar tu historial de retiros.' });
  }
});

// --- RUTAS SOLO PARA TI (ADMIN) ---

// GET /api/withdrawals/pending - todas las solicitudes pendientes (solo admin)
router.get('/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.id, w.amount_usdt, w.wallet_address, w.requested_at, u.email
       FROM withdrawals w JOIN users u ON u.id = w.user_id
       WHERE w.status = 'pending' ORDER BY w.requested_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /withdrawals/pending:', err);
    res.status(500).json({ error: 'No se pudo cargar la lista de retiros pendientes.' });
  }
});

// POST /api/withdrawals/:id/approve - marca como pagado (solo admin, tú ya enviaste el USDT a mano)
router.post('/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE withdrawals SET status = 'approved', processed_at = NOW()
       WHERE id = $1 AND status = 'pending' RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en /withdrawals/:id/approve:', err);
    res.status(500).json({ error: 'No se pudo aprobar el retiro.' });
  }
});

// POST /api/withdrawals/:id/reject - rechaza y devuelve los puntos al usuario (solo admin)
router.post('/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wResult = await client.query(
      `SELECT user_id, points_spent FROM withdrawals WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [req.params.id]
    );
    if (wResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada.' });
    }
    const { user_id, points_spent } = wResult.rows[0];

    await client.query(
      `UPDATE withdrawals SET status = 'rejected', processed_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    await client.query(
      'UPDATE users SET balance_points = balance_points + $1 WHERE id = $2',
      [points_spent, user_id]
    );

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en /withdrawals/:id/reject:', err);
    res.status(500).json({ error: 'No se pudo rechazar el retiro.' });
  } finally {
    client.release();
  }
});

// DELETE /api/withdrawals/history - el usuario borra su propio historial
// (solo elimina retiros ya procesados: pagados o rechazados; nunca uno pendiente)
router.delete('/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM withdrawals WHERE user_id = $1 AND status != 'pending'`,
      [req.userId]
    );
    res.json({ ok: true, deletedCount: result.rowCount });
  } catch (err) {
    console.error('Error en /withdrawals/history DELETE:', err);
    res.status(500).json({ error: 'No se pudo borrar el historial.' });
  }
});

module.exports = router;

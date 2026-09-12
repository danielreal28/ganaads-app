const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const SPIN_COOLDOWN_HOURS = 24;
const MAX_MEMORY_PLAYS_PER_DAY = 3;
const MEMORY_REWARD_POINTS = 15;

const WHEEL_PRIZES = [
  { points: 5, weight: 35 },
  { points: 10, weight: 30 },
  { points: 15, weight: 15 },
  { points: 20, weight: 10 },
  { points: 30, weight: 7 },
  { points: 50, weight: 3 },
];

function pickWeightedPrize() {
  const totalWeight = WHEEL_PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  for (const prize of WHEEL_PRIZES) {
    if (random < prize.weight) return prize.points;
    random -= prize.weight;
  }
  return WHEEL_PRIZES[0].points;
}

router.get('/spin-status', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT last_spin_at FROM users WHERE id = $1', [req.userId]);
    const lastSpinAt = result.rows[0].last_spin_at;

    if (!lastSpinAt) {
      return res.json({ canSpin: true, nextSpinAt: null });
    }

    const hoursSince = (Date.now() - new Date(lastSpinAt).getTime()) / (1000 * 60 * 60);
    if (hoursSince >= SPIN_COOLDOWN_HOURS) {
      return res.json({ canSpin: true, nextSpinAt: null });
    }

    const nextSpinAt = new Date(new Date(lastSpinAt).getTime() + SPIN_COOLDOWN_HOURS * 60 * 60 * 1000);
    res.json({ canSpin: false, nextSpinAt: nextSpinAt.toISOString() });
  } catch (err) {
    console.error('Error en /games/spin-status:', err);
    res.status(500).json({ error: 'No se pudo verificar el estado de la ruleta.' });
  }
});

router.post('/spin', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT last_spin_at FROM users WHERE id = $1 FOR UPDATE',
      [req.userId]
    );
    const lastSpinAt = userResult.rows[0].last_spin_at;

    if (lastSpinAt) {
      const hoursSince = (Date.now() - new Date(lastSpinAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince < SPIN_COOLDOWN_HOURS) {
        await client.query('ROLLBACK');
        return res.status(429).json({ error: 'Ya usaste tu giro de hoy. Vuelve mañana.' });
      }
    }

    const prizePoints = pickWeightedPrize();

    await client.query(
      'UPDATE users SET balance_points = balance_points + $1, last_spin_at = NOW() WHERE id = $2',
      [prizePoints, req.userId]
    );

    await client.query('COMMIT');
    res.json({ prizePoints });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en /games/spin:', err);
    res.status(500).json({ error: 'No se pudo girar la ruleta.' });
  } finally {
    client.release();
  }
});

router.get('/memory-status', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) FROM memory_plays WHERE user_id = $1 AND played_at >= CURRENT_DATE",
      [req.userId]
    );
    const playsToday = parseInt(result.rows[0].count, 10);
    res.json({
      playsToday,
      maxPlaysPerDay: MAX_MEMORY_PLAYS_PER_DAY,
      canPlay: playsToday < MAX_MEMORY_PLAYS_PER_DAY,
    });
  } catch (err) {
    console.error('Error en /games/memory-status:', err);
    res.status(500).json({ error: 'No se pudo verificar el estado del juego.' });
  }
});

router.post('/memory-complete', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const countResult = await client.query(
      "SELECT COUNT(*) FROM memory_plays WHERE user_id = $1 AND played_at >= CURRENT_DATE FOR UPDATE",
      [req.userId]
    );
    const playsToday = parseInt(countResult.rows[0].count, 10);

    if (playsToday >= MAX_MEMORY_PLAYS_PER_DAY) {
      await client.query('ROLLBACK');
      return res.status(429).json({ error: 'Alcanzaste el límite de partidas de hoy. Vuelve mañana.' });
    }

    await client.query(
      'INSERT INTO memory_plays (user_id, points_earned) VALUES ($1, $2)',
      [req.userId, MEMORY_REWARD_POINTS]
    );
    await client.query(
      'UPDATE users SET balance_points = balance_points + $1 WHERE id = $2',
      [MEMORY_REWARD_POINTS, req.userId]
    );

    await client.query('COMMIT');
    res.json({ pointsEarned: MEMORY_REWARD_POINTS, playsToday: playsToday + 1 });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en /games/memory-complete:', err);
    res.status(500).json({ error: 'No se pudo registrar la partida.' });
  } finally {
    client.release();
  }
});

module.exports = router;

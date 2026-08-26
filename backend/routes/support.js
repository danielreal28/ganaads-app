const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, sender, message, created_at FROM support_messages WHERE user_id = $1 ORDER BY created_at ASC',
      [req.userId]
    );
    await pool.query(
      "UPDATE support_messages SET read_by_user = TRUE WHERE user_id = $1 AND sender = 'admin'",
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /support/mine:', err);
    res.status(500).json({ error: 'No se pudo cargar el chat.' });
  }
});

router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) FROM support_messages WHERE user_id = $1 AND sender = 'admin' AND read_by_user = FALSE",
      [req.userId]
    );
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    console.error('Error en /support/unread-count:', err);
    res.status(500).json({ error: 'No se pudo verificar mensajes.' });
  }
});

router.post('/send', requireAuth, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO support_messages (user_id, sender, message, read_by_admin, read_by_user)
       VALUES ($1, 'user', $2, FALSE, TRUE)
       RETURNING id, sender, message, created_at`,
      [req.userId, message.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error en /support/send:', err);
    res.status(500).json({ error: 'No se pudo enviar el mensaje.' });
  }
});

router.get('/conversations', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id AS user_id,
        u.email,
        MAX(sm.created_at) AS last_message_at,
        COUNT(*) FILTER (WHERE sm.sender = 'user' AND sm.read_by_admin = FALSE) AS unread_count
      FROM support_messages sm
      JOIN users u ON u.id = sm.user_id
      GROUP BY u.id, u.email
      ORDER BY last_message_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /support/conversations:', err);
    res.status(500).json({ error: 'No se pudieron cargar las conversaciones.' });
  }
});

router.get('/conversation/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, sender, message, created_at FROM support_messages WHERE user_id = $1 ORDER BY created_at ASC',
      [req.params.userId]
    );
    await pool.query(
      "UPDATE support_messages SET read_by_admin = TRUE WHERE user_id = $1 AND sender = 'user'",
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /support/conversation/:userId:', err);
    res.status(500).json({ error: 'No se pudo cargar la conversación.' });
  }
});

router.post('/reply/:userId', requireAuth, requireAdmin, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO support_messages (user_id, sender, message, read_by_admin, read_by_user)
       VALUES ($1, 'admin', $2, TRUE, FALSE)
       RETURNING id, sender, message, created_at`,
      [req.params.userId, message.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error en /support/reply:', err);
    res.status(500).json({ error: 'No se pudo enviar la respuesta.' });
  }
});

module.exports = router;

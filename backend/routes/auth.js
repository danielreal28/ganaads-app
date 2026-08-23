const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');
const { sendPasswordResetEmail } = require('../mailer');

const router = express.Router();

function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex'); // ej: "a1b2c3d4"
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, isAdmin: user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, refCode } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ese email ya está registrado.' });
    }

    let referredBy = null;
    if (refCode) {
      const refUser = await pool.query('SELECT id FROM users WHERE referral_code = $1', [refCode]);
      if (refUser.rows.length > 0) {
        referredBy = refUser.rows[0].id;
      }
      // Si el código no existe, simplemente se ignora (no bloquea el registro).
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const myReferralCode = generateReferralCode();

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, referral_code, referred_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, referral_code, balance_points, is_admin`,
      [email.toLowerCase(), passwordHash, myReferralCode, referredBy]
    );

    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Error en /register:', err);
    res.status(500).json({ error: 'Error del servidor al registrar. Intenta de nuevo.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        referral_code: user.referral_code,
        balance_points: user.balance_points,
        is_admin: user.is_admin,
      },
    });
  } catch (err) {
    console.error('Error en /login:', err);
    res.status(500).json({ error: 'Error del servidor al iniciar sesión.' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'El email es obligatorio.' });
  }

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);

    if (userResult.rows.length > 0) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await pool.query(
        'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
        [tokenHash, expires, userResult.rows[0].id]
      );

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const resetLink = `${baseUrl}/reset-password.html?token=${rawToken}`;

      try {
        await sendPasswordResetEmail(email, resetLink);
      } catch (mailErr) {
        console.error('Error enviando correo de recuperacion:', mailErr);
      }
    }

    res.json({ ok: true, message: 'Si ese correo está registrado, te enviamos un enlace de recuperación.' });
  } catch (err) {
    console.error('Error en /forgot-password:', err);
    res.status(500).json({ error: 'Error del servidor. Intenta de nuevo.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Faltan datos.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const userResult = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [tokenHash]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'El enlace es inválido o ya expiró. Solicita uno nuevo.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [passwordHash, userResult.rows[0].id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Error en /reset-password:', err);
    res.status(500).json({ error: 'Error del servidor. Intenta de nuevo.' });
  }
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');

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

module.exports = router;

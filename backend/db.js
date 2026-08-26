const { Pool } = require('pg');

// Render entrega DATABASE_URL automáticamente al conectar el servicio
// a una base de datos PostgreSQL creada en el mismo panel.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});

// Crea las tablas si no existen todavía. Se ejecuta una vez al arrancar el servidor.
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      referral_code TEXT UNIQUE NOT NULL,
      referred_by INTEGER REFERENCES users(id),
      referral_bonus_paid BOOLEAN NOT NULL DEFAULT FALSE,
      balance_points INTEGER NOT NULL DEFAULT 0,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ad_views (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      points_earned INTEGER NOT NULL,
      viewed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      points_spent INTEGER NOT NULL,
      amount_usdt NUMERIC(10,2) NOT NULL,
      wallet_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
      requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMP
    );
  `);

  // Guarda configuración ajustable desde el panel admin, como el RPM real
  // reportado por AdSense, sin necesidad de tocar variables de entorno.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Amplía la precisión de los montos de retiro a 4 decimales
  // (antes solo guardaba 2, causando diferencias de redondeo).
  await pool.query(`ALTER TABLE withdrawals ALTER COLUMN amount_usdt TYPE NUMERIC(10,4);`);

  // Columnas para recuperación de contraseña (se agregan si no existen aún)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      read_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
      read_by_user BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  console.log('Base de datos lista (tablas verificadas/creadas).');
}

module.exports = { pool, initDb };

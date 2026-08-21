require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

const authRoutes = require('./routes/auth');
const adsRoutes = require('./routes/ads');
const userRoutes = require('./routes/user');
const withdrawalRoutes = require('./routes/withdrawals');

const app = express();
app.use(cors());
app.use(express.json());

// API
app.use('/api/auth', authRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/withdrawals', withdrawalRoutes);

// Sirve el frontend estático (carpeta /public) en la raíz del sitio
app.use(express.static(path.join(__dirname, '..', 'public')));

// Config pública mínima que el frontend necesita (ej. AdSense Publisher ID)
app.get('/api/config', (req, res) => {
  res.json({
    adsensePublisherId: process.env.ADSENSE_PUBLISHER_ID || '',
    pointsPerAd: parseInt(process.env.POINTS_PER_AD || '10', 10),
    pointsPerUsdt: parseInt(process.env.POINTS_PER_USDT || '1000', 10),
    minWithdrawalUsdt: parseFloat(process.env.MIN_WITHDRAWAL_USDT || '5'),
  });
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('No se pudo iniciar la base de datos:', err);
    process.exit(1);
  });

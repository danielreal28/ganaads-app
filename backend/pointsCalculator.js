const MARGIN_PERCENT = parseFloat(process.env.MARGIN_PERCENT || '50');
const FALLBACK_RPM_USDT = parseFloat(process.env.FALLBACK_RPM_USDT || '2');

// Calcula cuántos puntos se deben dar por cada anuncio visto, para que
// siempre quede el margen configurado (por defecto 50%) sobre el RPM real
// que el administrador reporta desde el panel /admin.html.
//
// RPM = ingreso real de Google por cada 1000 vistas de anuncio (en USDT).
// Si aún no se ha configurado ningún RPM real, se usa un valor conservador
// (FALLBACK_RPM_USDT) para no arriesgar dinero mientras no hay datos reales.
async function getCurrentPointsPerAd(pool) {
  const POINTS_PER_USDT = parseInt(process.env.POINTS_PER_USDT || '1000', 10);

  const result = await pool.query(
    "SELECT value FROM app_settings WHERE key = 'current_rpm_usdt'"
  );
  const rpm = result.rows.length > 0 ? parseFloat(result.rows[0].value) : FALLBACK_RPM_USDT;

  const payoutUsdtPerView = (rpm / 1000) * (MARGIN_PERCENT / 100);
  const points = Math.round(payoutUsdtPerView * POINTS_PER_USDT);

  // Nunca menos de 1 punto, para que ver un anuncio siempre otorgue algo.
  return Math.max(1, points);
}

module.exports = { getCurrentPointsPerAd, MARGIN_PERCENT, FALLBACK_RPM_USDT };

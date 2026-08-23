// Envía correos usando la API HTTP de Brevo (antes Sendinblue), en vez de
// SMTP directo. Render bloquea las conexiones SMTP salientes en el plan
// gratis, así que usamos una API por HTTPS, que sí funciona sin problema.
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function sendPasswordResetEmail(to, resetLink) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_USER;

  if (!apiKey || !senderEmail) {
    throw new Error('Faltan BREVO_API_KEY o EMAIL_USER en las variables de entorno.');
  }

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: 'GanaAds' },
      to: [{ email: to }],
      subject: 'Recupera tu contraseña — GanaAds',
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Recupera tu contraseña</h2>
          <p>Recibimos una solicitud para restablecer tu contraseña en GanaAds.</p>
          <p>
            <a href="${resetLink}" style="background:#2ED9A8; color:#06231B; padding:12px 20px; text-decoration:none; border-radius:8px; display:inline-block; font-weight:bold;">
              Crear nueva contraseña
            </a>
          </p>
          <p>Este enlace expira en 1 hora. Si no solicitaste esto, puedes ignorar este correo — tu contraseña actual sigue funcionando normalmente.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${errorText}`);
  }
}

module.exports = { sendPasswordResetEmail };

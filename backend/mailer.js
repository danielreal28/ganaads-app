const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendPasswordResetEmail(to, resetLink) {
  await transporter.sendMail({
    from: `"GanaAds" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Recupera tu contraseña — GanaAds',
    html: `
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
  });
}

module.exports = { sendPasswordResetEmail };

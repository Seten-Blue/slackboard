import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = (process.env.RESEND_API_KEY || '').trim();
const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

const resend = apiKey ? new Resend(apiKey) : null;

class EmailService {
  isConfigured(): boolean {
    return !!resend;
  }

  async sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
    if (!resend) {
      console.warn('⚠️  RESEND_API_KEY no configurado. No se pudo enviar el correo de recuperación.');
      console.log(`🔗 (modo desarrollo) Link de recuperación para ${to}: ${resetLink}`);
      return;
    }

    await resend.emails.send({
      from: `SlackBoard <${fromEmail}>`,
      to,
      subject: 'Recuperá tu contraseña de SlackBoard',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1a1a2e;">Recuperá tu contraseña</h2>
          <p style="color: #444;">Recibimos una solicitud para restablecer tu contraseña de SlackBoard. Si fuiste vos, hacé clic en el botón de abajo. El link expira en 30 minutos.</p>
          <a href="${resetLink}" style="display:inline-block; margin-top:16px; padding:12px 24px; background:#4c3fc9; color:white; text-decoration:none; border-radius:8px; font-weight:600;">
            Restablecer contraseña
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">Si no pediste esto, podés ignorar este correo con tranquilidad.</p>
        </div>
      `,
    });

    console.log(`✅ Correo de recuperación enviado a ${to}`);
  }
}

export default new EmailService();
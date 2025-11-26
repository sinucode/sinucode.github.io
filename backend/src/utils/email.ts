// import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { config } from '../config/env';
import logger from '../utils/logger';

// Configurar Resend si hay API key
const resend = config.email.resendApiKey ? new Resend(config.email.resendApiKey) : null;

// Fallback a nodemailer para desarrollo
/*
const _transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email',
  port: 587,
  secure: false,
  auth: {
    user: 'ethereal.user@ethereal.email',
    pass: 'ethereal.password',
  },
});
*/

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Enviar email usando Resend (producción) o Nodemailer (desarrollo)
 */
export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    // En producción, usar Resend
    if (config.nodeEnv === 'production' && resend) {
      await resend.emails.send({
        from: config.email.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      logger.info('Email sent via Resend', { to: options.to, subject: options.subject });
    } else {
      // En desarrollo, usar Nodemailer (o simplemente loggear)
      logger.info('Email (DEV MODE)', {
        to: options.to,
        subject: options.subject,
        preview: options.text || options.html.substring(0, 100),
      });
      // Descomentar para enviar emails reales en desarrollo
      // await transporter.sendMail({
      //   from: config.email.fromAddress,
      //   to: options.to,
      //   subject: options.subject,
      //   html: options.html,
      //   text: options.text,
      // });
    }
  } catch (error) {
    logger.error('Failed to send email', { error, to: options.to });
    throw new Error('Failed to send email');
  }
};

/**
 * Plantilla de recordatorio de pago
 */
export const sendPaymentReminder = async (
  clientName: string,
  clientEmail: string,
  dueDate: Date,
  amount: number
): Promise<void> => {
  const formattedDate = dueDate.toLocaleDateString('es-CO');
  const formattedAmount = amount.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .amount { font-size: 24px; font-weight: bold; color: #4F46E5; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Recordatorio de Pago</h1>
        </div>
        <div class="content">
          <p>Hola <strong>${clientName}</strong>,</p>
          <p>Te recordamos que tienes un pago programado para el día <strong>${formattedDate}</strong>.</p>
          <p>Monto a pagar: <span class="amount">${formattedAmount}</span></p>
          <p>Por favor, realiza tu pago a tiempo para mantener tu cuenta al día.</p>
          <p>Si ya realizaste el pago, por favor ignora este mensaje.</p>
          <p>¡Gracias por tu confianza!</p>
        </div>
        <div class="footer">
          <p>Este es un mensaje automático, por favor no respondas a este correo.</p>
          <p>&copy; ${new Date().getFullYear()} Gestióncredifacil. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Hola ${clientName},
    
    Te recordamos que tienes un pago programado para el día ${formattedDate}.
    Monto a pagar: ${formattedAmount}
    
    Por favor, realiza tu pago a tiempo para mantener tu cuenta al día.
    Si ya realizaste el pago, por favor ignora este mensaje.
    
    ¡Gracias por tu confianza!
  `;

  await sendEmail({
    to: clientEmail,
    subject: `Recordatorio de Pago - ${formattedDate}`,
    html,
    text,
  });
};

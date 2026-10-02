import { OtpProvider, OtpSendResult } from './OtpProvider.js';
import { env } from '../../config/env.js';
import nodemailer from 'nodemailer';

export class SmtpOtpProvider implements OtpProvider {
  name = 'smtp' as const;

  async send(identifier: string, channel: 'email' | 'sms', code: string): Promise<OtpSendResult> {
    if (channel !== 'email') {
      return { delivered: false, mode: 'real', message: 'SMTP provider can only send to email addresses.' };
    }
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      return { delivered: false, mode: 'real', message: 'SMTP provider is not fully configured.' };
    }

    try {
      const port = env.SMTP_PORT || 587;
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000
      });
      const result = await transporter.sendMail({
        from: env.SMTP_FROM || env.SMTP_USER,
        to: identifier,
        subject: 'Your CaseLens verification code',
        text: `Your CaseLens verification code is ${code}. It expires in 5 minutes.`,
        html: `<p>Your CaseLens verification code is <strong>${code}</strong>.</p><p>It expires in 5 minutes.</p>`
      });
      const acceptedRecipients = (result.accepted || []).map(recipient => String(recipient).toLowerCase());
      if (!acceptedRecipients.includes(identifier.toLowerCase())) {
        throw new Error(`SMTP server did not accept the OTP recipient ${identifier}.`);
      }
      return {
        delivered: true,
        mode: 'real',
        message: `OTP sent to email address ${identifier}`
      };
    } catch (err: unknown) {
      console.error('[SMTP OTP Error]', err);
      return {
        delivered: false,
        mode: 'real',
        message: err instanceof Error ? err.message : 'Failed to dispatch email'
      };
    }
  }
}

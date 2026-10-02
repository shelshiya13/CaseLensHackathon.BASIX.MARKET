import { OtpProvider, OtpSendResult } from './OtpProvider.js';
import { env } from '../../config/env.js';

export class SmsOtpProvider implements OtpProvider {
  name = 'sms-webhook' as const;

  async send(identifier: string, channel: 'email' | 'sms', code: string): Promise<OtpSendResult> {
    if (!env.SMS_WEBHOOK_URL) {
      return { delivered: false, mode: 'real', message: 'SMS webhook gateway URL is not configured.' };
    }

    try {
      console.log(`[SMS Webhook OTP] Dispatched to webhook ${env.SMS_WEBHOOK_URL} for ${identifier}`);
      const response = await fetch(env.SMS_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.SMS_WEBHOOK_TOKEN}` } : {})
        },
        body: JSON.stringify({
          recipient: identifier,
          code,
          message: `Your CaseLens verification code is: ${code}. Valid for 5 minutes.`
        })
      });

      if (!response.ok) {
        throw new Error(`SMS gateway responded with HTTP ${response.status}`);
      }

      return {
        delivered: true,
        mode: 'real',
        message: `OTP sent via SMS gateway to ${identifier}`
      };
    } catch (err: any) {
      console.error('[SMS Webhook Error]', err);
      return { delivered: false, mode: 'real', message: err.message || 'SMS delivery failed' };
    }
  }
}

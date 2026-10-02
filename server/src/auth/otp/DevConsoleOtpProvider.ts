import { OtpProvider, OtpSendResult } from './OtpProvider.js';
import { env } from '../../config/env.js';

export class DevConsoleOtpProvider implements OtpProvider {
  name = 'dev-console' as const;

  async send(identifier: string, channel: 'email' | 'sms', code: string): Promise<OtpSendResult> {
    console.log(`\n==================================================`);
    console.log(`[CASELENS DEV OTP] Destination: ${identifier} (${channel.toUpperCase()})`);
    console.log(`[CASELENS DEV OTP] Verification Code: ${code}`);
    console.log(`[CASELENS DEV OTP] Mode: Development (No actual message transmitted)`);
    console.log(`==================================================\n`);

    const showOnScreen = env.NODE_ENV !== 'production' || env.OTP_DEV_MODE;
    return {
      delivered: true,
      mode: 'dev',
      devCode: showOnScreen ? code : undefined,
      message: 'Dev mode: OTP shown on screen & logged to server console.'
    };
  }
}

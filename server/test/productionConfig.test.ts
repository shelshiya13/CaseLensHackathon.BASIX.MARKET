import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateTransport, mockSendMail } = vi.hoisted(() => ({
  mockCreateTransport: vi.fn(),
  mockSendMail: vi.fn()
}));

vi.mock('nodemailer', () => ({ default: { createTransport: mockCreateTransport } }));

import { env, envSchema } from '../src/config/env.js';
import { SmtpOtpProvider } from '../src/auth/otp/SmtpOtpProvider.js';

describe('production configuration and SMTP OTP delivery', () => {
  beforeEach(() => {
    env.SMTP_HOST = 'smtp.example.test';
    env.SMTP_PORT = 587;
    env.SMTP_USER = 'mailer@example.test';
    env.SMTP_PASS = 'smtp-password';
    env.SMTP_FROM = 'caselens@example.test';
    mockSendMail.mockReset();
    mockCreateTransport.mockReset();
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    mockSendMail.mockResolvedValue({ accepted: ['guardian@example.test'] });
  });

  it('sends an OTP through Nodemailer and reports delivery only after SMTP acceptance', async () => {
    const result = await new SmtpOtpProvider().send('guardian@example.test', 'email', '123456');

    expect(result.delivered).toBe(true);
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      requireTLS: true
    }));
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'caselens@example.test',
      to: 'guardian@example.test',
      text: expect.stringContaining('123456')
    }));
  });

  it('reports transport errors and rejected recipients as delivery failures', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));
    const rejectedDelivery = await new SmtpOtpProvider().send('guardian@example.test', 'email', '123456');
    expect(rejectedDelivery.delivered).toBe(false);
    expect(rejectedDelivery.message).toBe('SMTP unavailable');

    mockSendMail.mockResolvedValueOnce({ accepted: [] });
    const refusedRecipient = await new SmtpOtpProvider().send('guardian@example.test', 'email', '123456');
    expect(refusedRecipient.delivered).toBe(false);
    expect(refusedRecipient.message).toContain('did not accept');
  });

  it('rejects production configurations with development secrets, OTP mode, or no real delivery', () => {
    const production = {
      NODE_ENV: 'production',
      JWT_SECRET: 'unique-jwt-secret-with-at-least-32-characters',
      OTP_HMAC_SECRET: 'unique-otp-secret-with-at-least-32-characters',
      OTP_DEV_MODE: 'false',
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'mailer@example.test',
      SMTP_PASS: 'smtp-password'
    };
    expect(envSchema.safeParse(production).success).toBe(true);
    expect(envSchema.safeParse({ ...production, JWT_SECRET: 'dev_caselens_jwt_secret_min16_chars_default' }).success).toBe(false);
    expect(envSchema.safeParse({ ...production, OTP_DEV_MODE: 'true' }).success).toBe(false);
    expect(envSchema.safeParse({
      ...production,
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined
    }).success).toBe(false);
  });
});

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const defaultJwtSecret = 'dev_caselens_jwt_secret_min16_chars_default';
const defaultOtpSecret = 'dev_caselens_otp_hmac_secret_min16_chars';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long').default(defaultJwtSecret),
  OTP_HMAC_SECRET: z.string().min(16, 'OTP_HMAC_SECRET must be at least 16 characters long').default(defaultOtpSecret),
  DATA_DIR: z.string().default('./data'),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  OMEGA_API_KEY: z.string().optional(),
  OMEGA_BASE_URL: z.string().optional(),
  OTP_DEV_MODE: z.preprocess((v) => v === 'true' || v === '1' || v === true, z.boolean()).default(true),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMS_WEBHOOK_URL: z.string().optional(),
  SMS_WEBHOOK_TOKEN: z.string().optional()
}).superRefine((values, ctx) => {
  if (values.NODE_ENV !== 'production') return;

  for (const [name, value, developmentDefault] of [
    ['JWT_SECRET', values.JWT_SECRET, defaultJwtSecret],
    ['OTP_HMAC_SECRET', values.OTP_HMAC_SECRET, defaultOtpSecret]
  ] as const) {
    if (value === developmentDefault || value.startsWith('dev_') || value.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [name],
        message: `${name} must be a unique production secret of at least 32 characters`
      });
    }
  }

  if (values.OTP_DEV_MODE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OTP_DEV_MODE'],
      message: 'OTP_DEV_MODE must be false in production'
    });
  }

  const smtpConfigured = Boolean(values.SMTP_HOST && values.SMTP_USER && values.SMTP_PASS);
  const smsConfigured = Boolean(values.SMS_WEBHOOK_URL);
  if (!smtpConfigured && !smsConfigured) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMTP_HOST'],
      message: 'Production requires a configured SMTP or SMS OTP delivery provider'
    });
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const err of parsed.error.issues) {
    console.error(`- ${err.path.join('.')}: ${err.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

export function getSystemStatus() {
  const geminiKey =
    (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()) ||
    (env.GOOGLE_API_KEY && env.GOOGLE_API_KEY.trim()) ||
    (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) ||
    (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim());

  const geminiConfigured = Boolean(
    geminiKey &&
    geminiKey.length > 0 &&
    geminiKey !== 'your_gemini_api_key_here'
  );

  const omegaKey = (env.OMEGA_API_KEY && env.OMEGA_API_KEY.trim()) || (process.env.OMEGA_API_KEY && process.env.OMEGA_API_KEY.trim());
  const omegaConfigured = Boolean(
    omegaKey &&
    omegaKey.length > 0 &&
    omegaKey !== 'your_omega_api_key_here'
  );
  
  let otpProviderName = 'dev-console';
  let otpDescription = 'Dev Console (code logged to server & shown on screen)';
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    otpProviderName = 'smtp';
    otpDescription = `SMTP Email (${env.SMTP_HOST})`;
  } else if (env.SMS_WEBHOOK_URL) {
    otpProviderName = 'sms-webhook';
    otpDescription = 'SMS Webhook Gateway';
  }

  return {
    environment: env.NODE_ENV,
    gemini: {
      configured: geminiConfigured,
      model: env.GEMINI_MODEL,
      status: geminiConfigured ? 'Key present; connection not verified' : 'Not configured (AI features disabled)'
    },
    omega: {
      configured: omegaConfigured,
      status: omegaConfigured ? 'Configured; connection not verified' : 'Local store (Omega not configured)'
    },
    otp: {
      provider: otpProviderName,
      description: otpDescription,
      devMode: env.OTP_DEV_MODE
    },
    storage: {
      dataDir: path.resolve(env.DATA_DIR),
      status: 'Ready'
    }
  };
}

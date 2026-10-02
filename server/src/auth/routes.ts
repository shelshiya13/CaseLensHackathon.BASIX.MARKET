import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { signToken, requireAuth, AuthUser } from './middleware.js';
import { getOtpProvider, generateOtpCode, hashOtp, detectChannel } from './otp/index.js';
import { logAudit } from '../audit/auditLog.js';

export const authRouter = Router();

// In-memory simple rate limiting for auth endpoints
const rateLimitMap = new Map<string, { attempts: number; firstAttempt: number }>();
function checkRateLimit(key: string, limit = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  for (const [candidate, entry] of rateLimitMap) {
    if (now - entry.firstAttempt > windowMs) rateLimitMap.delete(candidate);
  }
  while (rateLimitMap.size >= 10_000 && !rateLimitMap.has(key)) {
    const oldestKey = rateLimitMap.keys().next().value;
    if (oldestKey === undefined) break;
    rateLimitMap.delete(oldestKey);
  }
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.firstAttempt > windowMs) {
    rateLimitMap.set(key, { attempts: 1, firstAttempt: now });
    return true;
  }
  if (entry.attempts >= limit) {
    return false;
  }
  entry.attempts += 1;
  return true;
}

// 1. Lawyer Registration
authRouter.post('/lawyer/register', async (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string().min(2, 'Name is required'),
    email: z.string().email('Valid email is required'),
    password: z.string().min(10, 'Password must be at least 10 characters long'),
    enrolmentId: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  }

  const { name, email, password, enrolmentId } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const ip = req.ip || 'anonymous';
  if (!checkRateLimit(`register:${ip}:${normalizedEmail}`)) {
    return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many registration attempts. Please wait 15 minutes.' } });
  }

  const db = await getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(400).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, role, name, email, password_hash, enrolment_id, created_at)
    VALUES (?, 'lawyer', ?, ?, ?, ?, ?)
  `).run(userId, name, normalizedEmail, passwordHash, enrolmentId || null, now);

  const authUser: AuthUser = {
    userId,
    role: 'lawyer',
    name,
    email: normalizedEmail
  };

  const token = signToken(authUser);
  res.cookie('caselens_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  await logAudit({
    actorId: userId,
    action: 'lawyer_register',
    entityType: 'user',
    entityId: userId,
    details: { email }
  });

  return res.json({ user: authUser, token });
});

// 2. Lawyer Login
authRouter.post('/lawyer/login', async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid credentials format' } });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const ip = req.ip || 'anonymous';
  const rateLimitKey = `login:${ip}:${normalizedEmail}`;
  if (!checkRateLimit(rateLimitKey)) {
    return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please wait 15 minutes.' } });
  }

  const db = await getDb();
  const user = db.prepare<any>('SELECT * FROM users WHERE email = ? AND role = ?').get(normalizedEmail, 'lawyer');

  if (!user || !user.password_hash) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
  }

  // Reset rate limiting on successful authentication
  rateLimitMap.delete(rateLimitKey);

  const authUser: AuthUser = {
    userId: user.id,
    role: 'lawyer',
    name: user.name,
    email: user.email
  };

  const token = signToken(authUser);
  res.cookie('caselens_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  await logAudit({
    actorId: user.id,
    action: 'lawyer_login',
    entityType: 'user',
    entityId: user.id
  });

  return res.json({ user: authUser, token });
});

// 3. Lawyer password reset request
authRouter.post('/lawyer/password-reset/request', async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email('A valid lawyer email is required')
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const db = await getDb();
  const user = db.prepare<any>('SELECT * FROM users WHERE email = ? AND role = ?').get(email, 'lawyer');
  if (!user) {
    return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'No lawyer account matches that email.' } });
  }

  const recentChallenge = db.prepare<any>(`
    SELECT created_at FROM password_reset_tokens
    WHERE user_id = ? AND consumed_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(user.id);

  if (recentChallenge) {
    const elapsedMs = Date.now() - new Date(recentChallenge.created_at).getTime();
    if (elapsedMs < 30 * 1000) {
      const waitSeconds = Math.ceil((30 * 1000 - elapsedMs) / 1000);
      return res.status(429).json({
        error: { code: 'COOLDOWN', message: `Please wait ${waitSeconds} seconds before requesting another reset code.` }
      });
    }
  }

  const code = generateOtpCode();
  const codeHmac = hashOtp(email, code);
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
  db.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, identifier, code_hmac, expires_at, attempts, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(challengeId, user.id, email, codeHmac, expiresAt, now);

  const otpProvider = getOtpProvider('email');
  const result = await otpProvider.send(email, 'email', code);
  if (!result.delivered) {
    db.prepare('DELETE FROM password_reset_tokens WHERE id = ?').run(challengeId);
    return res.status(503).json({
      error: { code: 'RESET_SMS_FAILURE', message: result.message || 'Password reset was unable to deliver a verification code.' }
    });
  }

  return res.json({
    success: true,
    identifier: email,
    channel: 'email',
    mode: result.mode,
    devCode: result.devCode,
    message: result.message || 'Password reset code sent.'
  });
});

// 4. Lawyer password reset confirmation
authRouter.post('/lawyer/password-reset/confirm', async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email('A valid lawyer email is required'),
    code: z.string().length(6, 'Verification code must be 6 digits'),
    newPassword: z.string().min(10, 'Password must be at least 10 characters long')
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  }

  const { email, code, newPassword } = parsed.data;
  const db = await getDb();
  const user = db.prepare<any>('SELECT * FROM users WHERE email = ? AND role = ?').get(email.trim().toLowerCase(), 'lawyer');
  if (!user) {
    return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'No lawyer account matches that email.' } });
  }

  const challenge = db.prepare<any>(`
    SELECT * FROM password_reset_tokens
    WHERE user_id = ? AND consumed_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(user.id);

  if (!challenge) {
    return res.status(400).json({ error: { code: 'NO_ACTIVE_RESET', message: 'No active password reset request found. Please request a new code.' } });
  }

  if (new Date() > new Date(challenge.expires_at)) {
    return res.status(400).json({ error: { code: 'EXPIRED', message: 'This reset code has expired. Please request a new one.' } });
  }

  if (challenge.attempts >= 5) {
    return res.status(400).json({ error: { code: 'MAX_ATTEMPTS_EXCEEDED', message: 'Too many incorrect attempts. Please request a new reset code.' } });
  }

  const expected = Buffer.from(hashOtp(email.trim().toLowerCase(), code), 'hex');
  const actual = Buffer.from(challenge.code_hmac, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    db.prepare('UPDATE password_reset_tokens SET attempts = attempts + 1 WHERE id = ?').run(challenge.id);
    const remaining = 4 - challenge.attempts;
    return res.status(400).json({
      error: {
        code: 'INVALID_CODE',
        message: remaining > 0 ? `Incorrect reset code. ${remaining} attempts remaining.` : 'Too many incorrect attempts. Please request a new reset code.'
      }
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
  db.prepare('UPDATE password_reset_tokens SET consumed_at = ? WHERE id = ?').run(new Date().toISOString(), challenge.id);

  await logAudit({
    actorId: user.id,
    action: 'lawyer_password_reset',
    entityType: 'user',
    entityId: user.id,
    details: { email }
  });

  return res.json({ success: true, message: 'Password reset successful.' });
});

// 5. Guardian OTP Request
authRouter.post('/guardian/otp/request', async (req: Request, res: Response) => {
  const schema = z.object({
    identifier: z.string().min(3, 'Email or mobile required')
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Identifier is required' } });
  }

  const cleanIdentifier = parsed.data.identifier.trim().toLowerCase();
  const ip = req.ip || 'anonymous';
  if (!checkRateLimit(`otp_req:${ip}:${cleanIdentifier}`, 5, 5 * 60 * 1000)) {
    return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many OTP requests. Please wait a few minutes.' } });
  }

  const db = await getDb();

  // Check if guardian user exists and is linked to at least one case
  const user = db.prepare<any>(`
    SELECT u.id, u.name, u.role
    FROM users u
    JOIN case_access ca ON ca.user_id = u.id
    WHERE (u.email = ? OR u.mobile = ?) AND u.role = 'guardian' AND ca.access_level = 'guardian_view'
    LIMIT 1
  `).get(cleanIdentifier, cleanIdentifier);

  if (!user) {
    return res.status(404).json({
      error: {
        code: 'NOT_LINKED',
        message: 'No cases are linked to this identifier. Please contact your lawyer.'
      }
    });
  }

  // Check recent unconsumed challenge for 30s resend cooldown
  const recentChallenge = db.prepare<any>(`
    SELECT created_at FROM otp_challenges
    WHERE identifier = ? AND consumed_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(cleanIdentifier);

  if (recentChallenge) {
    const elapsedMs = Date.now() - new Date(recentChallenge.created_at).getTime();
    if (elapsedMs < 30 * 1000) {
      const waitSeconds = Math.ceil((30 * 1000 - elapsedMs) / 1000);
      return res.status(429).json({
        error: { code: 'COOLDOWN', message: `Please wait ${waitSeconds} seconds before requesting a new code.` }
      });
    }
  }

  const code = generateOtpCode();
  const codeHmac = hashOtp(cleanIdentifier, code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const challengeId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO otp_challenges (id, identifier, code_hmac, expires_at, attempts, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(challengeId, cleanIdentifier, codeHmac, expiresAt, now);

  const channel = detectChannel(cleanIdentifier);
  let dispatchResult;
  try {
    const otpProvider = getOtpProvider(channel);
    dispatchResult = await otpProvider.send(cleanIdentifier, channel, code);
  } catch (error) {
    db.prepare('DELETE FROM otp_challenges WHERE id = ?').run(challengeId);
    console.error('[OTP Delivery Error]', error);
    return res.status(503).json({
      error: {
        code: 'OTP_DELIVERY_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'OTP delivery is unavailable.'
      }
    });
  }

  if (!dispatchResult.delivered) {
    db.prepare('DELETE FROM otp_challenges WHERE id = ?').run(challengeId);
    return res.status(502).json({
      error: {
        code: 'OTP_DELIVERY_FAILED',
        message: dispatchResult.message || 'OTP provider did not deliver the verification code.'
      }
    });
  }

  return res.json({
    success: true,
    identifier: cleanIdentifier,
    channel,
    mode: dispatchResult.mode,
    devCode: dispatchResult.devCode,
    message: dispatchResult.message || 'Verification code sent.'
  });
});

// 4. Guardian OTP Verify
authRouter.post('/guardian/otp/verify', async (req: Request, res: Response) => {
  const schema = z.object({
    identifier: z.string().min(3),
    code: z.string().length(6, 'Verification code must be 6 digits')
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A 6-digit code is required' } });
  }

  const { identifier, code } = parsed.data;
  const cleanIdentifier = identifier.trim().toLowerCase();
  const db = await getDb();

  const challenge = db.prepare<any>(`
    SELECT * FROM otp_challenges
    WHERE identifier = ? AND consumed_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(cleanIdentifier);

  if (!challenge) {
    return res.status(400).json({ error: { code: 'NO_ACTIVE_CHALLENGE', message: 'No pending verification code found. Please request a new code.' } });
  }

  // Check expiration
  if (new Date() > new Date(challenge.expires_at)) {
    return res.status(400).json({ error: { code: 'EXPIRED', message: 'Verification code has expired. Please request a new one.' } });
  }

  // Check attempt limit (max 5)
  if (challenge.attempts >= 5) {
    return res.status(400).json({ error: { code: 'MAX_ATTEMPTS_EXCEEDED', message: 'Too many incorrect attempts. Please request a new code.' } });
  }

  const calculatedHmac = Buffer.from(hashOtp(cleanIdentifier, code), 'hex');
  const expectedHmac = Buffer.from(challenge.code_hmac, 'hex');
  if (calculatedHmac.length !== expectedHmac.length || !crypto.timingSafeEqual(calculatedHmac, expectedHmac)) {
    db.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?').run(challenge.id);
    const remaining = 4 - challenge.attempts;
    return res.status(400).json({
      error: {
        code: 'INVALID_CODE',
        message: remaining > 0 ? `Incorrect verification code. ${remaining} attempts remaining.` : 'Too many incorrect attempts. Please request a new code.'
      }
    });
  }

  // Mark consumed
  db.prepare('UPDATE otp_challenges SET consumed_at = ? WHERE id = ?').run(new Date().toISOString(), challenge.id);

  // Retrieve guardian user
  const user = db.prepare<any>(`
    SELECT * FROM users WHERE (email = ? OR mobile = ?) AND role = 'guardian'
  `).get(cleanIdentifier, cleanIdentifier);

  if (!user) {
    return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'Guardian user not found.' } });
  }

  const authUser: AuthUser = {
    userId: user.id,
    role: 'guardian',
    name: user.name,
    email: user.email || undefined,
    mobile: user.mobile || undefined
  };

  const token = signToken(authUser);
  res.cookie('caselens_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  await logAudit({
    actorId: user.id,
    action: 'guardian_login',
    entityType: 'user',
    entityId: user.id
  });

  return res.json({ user: authUser, token });
});

// 5. Current User
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  return res.json({ user: req.user });
});

// 6. Logout
authRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('caselens_token');
  return res.json({ success: true });
});

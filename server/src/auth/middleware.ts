import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AuthUser {
  userId: string;
  role: 'lawyer' | 'guardian';
  name: string;
  email?: string;
  mobile?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      userId: user.userId,
      role: user.role,
      name: user.name,
      email: user.email,
      mobile: user.mobile
    },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const cookieToken = req.cookies?.caselens_token?.trim();
  const tokenCandidates = [authHeader, cookieToken].filter((t): t is string => Boolean(t && t.length > 0));

  for (const token of tokenCandidates) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;
      req.user = payload;
      break;
    } catch {
      // Invalid or expired token, try next candidate if available
    }
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
    });
  }
  next();
}

export function requireRole(role: 'lawyer' | 'guardian') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }
    if (req.user.role !== role) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: `Access requires ${role} role` }
      });
    }
    next();
  };
}

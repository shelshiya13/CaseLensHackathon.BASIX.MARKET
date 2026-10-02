import 'express-async-errors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { authenticate } from './auth/middleware.js';
import { authRouter } from './auth/routes.js';
import { casesRouter } from './cases/routes.js';
import { documentsRouter } from './documents/routes.js';
import { evidenceRouter } from './evidence/routes.js';
import { dashboardRouter } from './dashboard/routes.js';
import { notificationsRouter } from './notifications/routes.js';
import { jobsRouter } from './jobs/routes.js';
import { systemRouter } from './system/routes.js';
import { aiRouter } from './ai/routes.js';
import { i18nRouter } from './i18n/routes.js';
import { entityRouter } from './entities/routes.js';
import { guardianSummaryRouter } from './guardian/routes.js';
import { ocrRouter } from './ocr/routes.js';
import { trustRouter } from './trust/routes.js';
import { insightsRouter } from './insights/routes.js';
import { caseAgentRouter } from './agents/caseAgentRoutes.js';

export function createExpressApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(authenticate);

  // Health probe
  app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/cases', casesRouter);
  app.use('/api', aiRouter);
  app.use('/api', i18nRouter);
  app.use('/api', entityRouter);
  app.use('/api', guardianSummaryRouter);
  app.use('/api', ocrRouter);
  app.use('/api', trustRouter);
  app.use('/api', insightsRouter);
  app.use('/api', caseAgentRouter);
  app.use('/api/cases', documentsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api', evidenceRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/guardian', dashboardRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/system', systemRouter);
  app.use('/api', systemRouter);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `No API route for ${req.method} ${req.path}` } });
  });

  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    const status = Number((error as { status?: number; statusCode?: number })?.statusCode || (error as { status?: number })?.status);
    const multerCode = (error as { code?: string })?.code;
    const statusCode = status >= 400 && status < 600
      ? status
      : multerCode === 'LIMIT_FILE_SIZE'
      ? 413
      : multerCode?.startsWith('LIMIT_')
      ? 400
      : 500;
    const message = error instanceof Error ? error.message : 'Unknown server error';
    console.error('[HTTP Error]', { method: req.method, path: req.path, statusCode, error });
    return res.status(statusCode).json({
      error: {
        code: multerCode || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
        message: process.env.NODE_ENV === 'production' && statusCode === 500 ? 'Internal server error.' : message
      }
    });
  });

  return app;
}

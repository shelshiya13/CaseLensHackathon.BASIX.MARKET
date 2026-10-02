import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getSystemStatus } from '../config/env.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { seedDemoCase, generateDemoPdfsIfNeeded } from '../seed/demoCase.js';
import { isGeminiAuthenticationRejected } from '../agents/geminiClient.js';
import { getSystemCaseAgentStatus } from '../agents/caseAgents.js';

export const systemRouter = Router();

// GET /api/system/status - Live integration status
systemRouter.get('/status', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const systemStatus = getSystemStatus();
  const authenticationRejected = isGeminiAuthenticationRejected();
  const status = {
    ...systemStatus,
    gemini: {
      ...systemStatus.gemini,
      authenticationRejected,
      status: authenticationRejected
        ? 'Authentication unavailable; deterministic fallback active'
        : systemStatus.gemini.status
    },
    caseAgents: await getSystemCaseAgentStatus()
  };
  return res.json({ status });
});

// POST /api/demo/load - Load demo case
systemRouter.post('/demo/load', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  try {
    const result = await seedDemoCase();
    if (!result.success) {
      return res.json({ ...result, success: true, alreadyExists: true });
    }
    return res.json(result);
  } catch (err: any) {
    console.error('Failed to load demo case:', err);
    return res.status(500).json({ error: { code: 'DEMO_SEED_FAILED', message: err.message } });
  }
});

// GET /api/demo/files - List demo test documents
systemRouter.get('/demo/files', async (req: Request, res: Response) => {
  await generateDemoPdfsIfNeeded();
  const dir = path.resolve('server/src/seed/demo-docs');
  if (!fs.existsSync(dir)) return res.json({ files: [] });

  const allFiles = fs.readdirSync(dir).filter(f => f.endsWith('.txt') || f.endsWith('.pdf')).sort();
  const fileInfos = allFiles.map(filename => {
    const stat = fs.statSync(path.join(dir, filename));
    return {
      filename,
      size: stat.size,
      isPdf: filename.endsWith('.pdf'),
      description: filename.includes('01')
        ? 'Supply Contract specifying delivery by 10 August 2026 & ₹2,40,000 price'
        : filename.includes('02')
        ? 'Tax Invoice INV-2041 billing ₹2,40,000 on 12 August 2026'
        : filename.includes('03')
        ? 'Email from Buyer claiming full payment without bank receipt'
        : filename.includes('04')
        ? 'Bank Confirmation showing partial payment of ₹1,80,000 (creates conflict)'
        : 'Delivery Challan showing arrival on 17 August 2026 (creates date mismatch)'
    };
  });

  return res.json({ files: fileInfos });
});

// GET /api/demo/files/:filename - Download demo file
systemRouter.get('/demo/files/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.resolve('server/src/seed/demo-docs', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'Demo file not found' } });
  }

  const isPdf = filename.endsWith('.pdf');
  res.setHeader('Content-Type', isPdf ? 'application/pdf' : 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

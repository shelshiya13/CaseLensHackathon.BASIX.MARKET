import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canAccessCase } from '../access/policy.js';
import {
  CASE_AGENT_TYPES, runCaseAgent, listCaseAgentRuns, getCaseAgentStatus,
  reviewCaseAgentRun, getAgentRunPdf, exportAgentMarkdown, verifyEvidenceRequestItem
} from './caseAgents.js';

export const caseAgentRouter = Router();

caseAgentRouter.get('/cases/:id/ai-agents', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_internal')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  const [agents, runs] = await Promise.all([getCaseAgentStatus(caseId), listCaseAgentRuns(caseId)]);
  return res.json({ agents, runs });
});

caseAgentRouter.post('/cases/:id/ai-agents/:agentType/run', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const agentType = req.params.agentType;
  if (!CASE_AGENT_TYPES.includes(agentType as any)) return res.status(404).json({ error: { code: 'UNKNOWN_AGENT', message: 'Unknown CaseLens agent.' } });
  if (!await canAccessCase(req.user, caseId, 'review')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found or closed for review' } });
  try {
    const run = await runCaseAgent(caseId, agentType as any, req.user!.userId, 'manual');
    return res.json({ run });
  } catch (error: any) {
    if (error?.status === 409) return res.status(409).json({ error: { code: 'NO_OPEN_MISSING_EVIDENCE', message: error.message } });
    if (error instanceof Error && error.message === 'Case not found') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
    throw error;
  }
});

caseAgentRouter.patch('/cases/:id/ai-agents/runs/:runId/review', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'review')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found or closed for review' } });
  const { decision, comment } = req.body || {};
  if (!['approve', 'dismiss', 'comment'].includes(decision) || (comment !== undefined && (typeof comment !== 'string' || comment.length > 2000))) {
    return res.status(400).json({ error: { code: 'INVALID_REVIEW', message: 'Provide approve, dismiss, or comment and a comment of up to 2,000 characters.' } });
  }
  const run = await reviewCaseAgentRun(caseId, req.params.runId, req.user!.userId, decision, comment || '');
  if (!run) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Agent run not found' } });
  return res.json({ run });
});

caseAgentRouter.post('/cases/:id/ai-agents/evidence-requests/:itemId/verify', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'review')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found or closed for review' } });
  const verified = req.body?.verified;
  if (typeof verified !== 'boolean') return res.status(400).json({ error: { code: 'INVALID_VERIFICATION', message: 'verified must be true or false.' } });
  const success = await verifyEvidenceRequestItem(caseId, req.params.itemId, req.user!.userId, verified);
  if (!success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evidence request item is not awaiting review.' } });
  return res.json({ success });
});

caseAgentRouter.get('/cases/:id/ai-agents/runs/:runId/brief.pdf', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_internal')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  const pdf = await getAgentRunPdf(caseId, req.params.runId);
  if (!pdf) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Hearing brief not found' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="caselens-hearing-brief-${req.params.runId}.pdf"`);
  return res.send(pdf);
});

caseAgentRouter.get('/cases/:id/ai-agents/runs/:runId/brief.md', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_internal')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  const markdown = await exportAgentMarkdown(caseId, req.params.runId);
  if (!markdown) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Hearing brief not found' } });
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="caselens-hearing-brief-${req.params.runId}.md"`);
  return res.send(markdown);
});

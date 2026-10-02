import crypto from 'crypto';
import { getDb } from '../db/client.js';
import { processDocumentPipeline, runManualAnalysis } from '../agents/orchestrator.js';
import { runHumanReviewReanalysis } from '../review/service.js';
import type { DatabaseClient } from '../db/client.js';

export type JobKind = 'process_document' | 'run_analysis' | 'reanalyze_after_review';

export interface JobRequest {
  caseId: string;
  kind: JobKind;
  documentId?: string | null;
}

export function insertQueuedJob(db: DatabaseClient, request: JobRequest): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const stepLog = JSON.stringify([{ step: 'uploading', timestamp: now, message: 'Job registered in queue.' }]);

  db.prepare(`
    INSERT INTO jobs (id, case_id, document_id, kind, status, step, step_log_json, created_at)
    VALUES (?, ?, ?, ?, 'queued', 'uploading', ?, ?)
  `).run(id, request.caseId, request.documentId || null, request.kind, stepLog, now);

  return id;
}

export function scheduleWorker(): void {
  setImmediate(() => {
    processNextJob().catch(err => console.error('[Worker Error]', err));
  });
}

export async function enqueueJob(
  caseId: string,
  kind: JobKind,
  documentId?: string | null
): Promise<string> {
  const db = await getDb();
  const id = db.transaction(() => insertQueuedJob(db, { caseId, kind, documentId }))();
  scheduleWorker();
  return id;
}

let isProcessing = false;

export async function processNextJob() {
  if (isProcessing) return;
  isProcessing = true;
  let db: Awaited<ReturnType<typeof getDb>> | null = null;
  let currentJobId: string | null = null;

  try {
    db = await getDb();
    const nextJob = db.prepare<any>(`
      SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1
    `).get();

    if (!nextJob) {
      isProcessing = false;
      return;
    }
    currentJobId = nextJob.id;

    db.prepare("UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      nextJob.id
    );

    if (nextJob.kind === 'process_document' && nextJob.document_id) {
      await processDocumentPipeline(nextJob.id, nextJob.case_id, nextJob.document_id);
    } else if (nextJob.kind === 'run_analysis') {
      const caseRow = db.prepare<any>('SELECT assigned_lawyer_id FROM cases WHERE id = ?').get(nextJob.case_id);
      if (!caseRow) throw new Error(`Analysis job ${nextJob.id} references a missing case.`);
      await runManualAnalysis(nextJob.case_id, caseRow.assigned_lawyer_id);
      db.prepare("UPDATE jobs SET status = 'done', step = 'done', finished_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        nextJob.id
      );
    } else if (nextJob.kind === 'reanalyze_after_review') {
      await runHumanReviewReanalysis(nextJob.id, nextJob.case_id);
    } else {
      throw new Error(`Unsupported queued job kind "${nextJob.kind}".`);
    }

  } catch (err) {
    console.error('[Worker Loop Exception]', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (db && currentJobId) {
      db.prepare("UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(
        errorMessage,
        new Date().toISOString(),
        currentJobId
      );
    }
    throw err;
  } finally {
    isProcessing = false;
    if (db?.prepare<any>("SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1").get()) {
      setImmediate(() => processNextJob().catch(err => console.error('[Worker Error]', err)));
    }
  }
}

export function startBackgroundWorker() {
  setInterval(() => {
    processNextJob().catch(err => console.error('[Worker Periodic Error]', err));
  }, 1000);
}

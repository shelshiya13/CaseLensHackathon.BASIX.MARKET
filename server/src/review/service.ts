import crypto from 'crypto';
import { getDb } from '../db/client.js';
import { parseIndianAmount, parseLegalDate } from '../agents/evidenceAgent.js';
import { evaluateDeterministicConflicts } from '../agents/rules/conflictRules.js';
import { evaluateMissingEvidenceRules } from '../agents/rules/requirementRules.js';
import { runReconciliationAgent } from '../agents/reconciliationAgent.js';
import { buildCaseStateFromDb } from '../agents/state/caseState.js';
import { getActiveStateAdapter } from '../agents/state/omegaAdapter.js';
import { recordTimelineEvent } from '../agents/timelineAgent.js';
import { updateCaseStatusIfNeeded } from '../cases/status.js';
import { logAudit } from '../audit/auditLog.js';
import { enqueueJob } from '../jobs/queue.js';
import { invalidateSignoffs } from '../versions/signoffService.js';
import { runScheduledCaseAgents } from '../agents/caseAgents.js';

export interface HumanReviewPayload {
  action: 'confirm' | 'correct_value' | 'reject';
  fieldToCorrect?: 'amount' | 'date' | 'factText' | 'entity' | 'evidenceType';
  correctedValue?: string;
  reason: string;
}

export async function submitEvidenceReview(
  caseId: string,
  evidenceId: string,
  reviewerId: string,
  payload: HumanReviewPayload
) {
  const db = await getDb();
  const original = db.prepare<any>('SELECT * FROM evidence WHERE id = ? AND case_id = ?').get(evidenceId, caseId);
  if (!original) throw new Error('Evidence item not found');

  const lawyer = db.prepare<any>('SELECT name FROM users WHERE id = ?').get(reviewerId);
  const lawyerName = lawyer ? lawyer.name : 'Advocate';
  const reviewId = crypto.randomUUID();
  const now = new Date().toISOString();

  if (payload.action === 'confirm') {
    db.prepare(`
      INSERT INTO human_reviews (id, case_id, evidence_id, action, reason, reviewer_id, created_at)
      VALUES (?, ?, ?, 'confirm', ?, ?, ?)
    `).run(reviewId, caseId, evidenceId, payload.reason || 'Verified as accurate by counsel.', reviewerId, now);

    await recordTimelineEvent({
      caseId,
      eventType: 'review_requested',
      description: `Evidence ${original.evidence_ref} confirmed by ${lawyerName}.`,
      source: original.evidence_ref,
      actorType: 'lawyer',
      actorId: reviewerId,
      guardianVisible: false
    });

    await logAudit({
      actorId: reviewerId,
      action: 'evidence_confirm',
      entityType: 'evidence',
      entityId: evidenceId,
      caseId
    });

    return { reviewId, status: 'confirmed' };
  }

  if (payload.action === 'reject') {
    db.prepare("UPDATE evidence SET status = 'rejected' WHERE id = ?").run(evidenceId);

    db.prepare(`
      INSERT INTO human_reviews (id, case_id, evidence_id, action, reason, reviewer_id, created_at)
      VALUES (?, ?, ?, 'reject', ?, ?, ?)
    `).run(reviewId, caseId, evidenceId, payload.reason, reviewerId, now);

    await recordTimelineEvent({
      caseId,
      eventType: 'evidence_challenged',
      description: `Evidence ${original.evidence_ref} marked rejected by ${lawyerName}: "${payload.reason}".`,
      source: original.evidence_ref,
      actorType: 'lawyer',
      actorId: reviewerId,
      guardianVisible: false
    });

    // Enqueue reanalysis
    await enqueueJob(caseId, 'reanalyze_after_review');
    return { reviewId, status: 'rejected' };
  }

  if (payload.action === 'correct_value') {
    if (!payload.fieldToCorrect || !payload.correctedValue) {
      throw new Error('Field to correct and corrected value are required');
    }

    const originalValues = {
      fact_text: original.fact_text,
      amount_raw: original.amount_raw,
      amount_value: original.amount_value,
      date_raw: original.date_raw,
      date_value: original.date_value,
      entity: original.entity,
      evidence_type: original.evidence_type
    };

    // Calculate new values for corrected row
    let newAmountRaw = original.amount_raw;
    let newAmountValue = original.amount_value;
    let newCurrency = original.currency;
    let newDateRaw = original.date_raw;
    let newDateValue = original.date_value;
    let newFactText = original.fact_text;
    let newEntity = original.entity;
    let newType = original.evidence_type;

    if (payload.fieldToCorrect === 'amount') {
      newAmountRaw = payload.correctedValue;
      const parsedAmt = parseIndianAmount(payload.correctedValue);
      newAmountValue = parsedAmt.value;
      newCurrency = parsedAmt.currency;
    } else if (payload.fieldToCorrect === 'date') {
      newDateRaw = payload.correctedValue;
      newDateValue = parseLegalDate(payload.correctedValue);
    } else if (payload.fieldToCorrect === 'factText') {
      newFactText = payload.correctedValue;
    } else if (payload.fieldToCorrect === 'entity') {
      newEntity = payload.correctedValue;
    } else if (payload.fieldToCorrect === 'evidenceType') {
      newType = payload.correctedValue;
    }

    // Mark original as corrected
    db.prepare("UPDATE evidence SET status = 'corrected' WHERE id = ?").run(evidenceId);

    // Create new corrected evidence row
    const newEvidenceId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO evidence (
        id, case_id, evidence_ref, document_id, page_no, chunk_id,
        evidence_type, fact_label, fact_text, entity, date_value,
        date_raw, amount_value, currency, amount_raw, source_quote,
        confidence, confidence_basis, status, supersedes_evidence_id,
        created_by, validation_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'human', ?, ?)
    `).run(
      newEvidenceId,
      caseId,
      original.evidence_ref, // Keep the same reference or ref sequence
      original.document_id,
      original.page_no,
      original.chunk_id,
      newType,
      `${original.fact_label} (Corrected)`,
      newFactText,
      newEntity,
      newDateValue,
      newDateRaw,
      newAmountValue,
      newCurrency,
      newAmountRaw,
      original.source_quote,
      1.0, // Human verified
      JSON.stringify({ human_corrected: true, reviewer: lawyerName }),
      evidenceId,
      `Corrected by ${lawyerName}: ${payload.reason}`,
      now
    );

    // Record review record
    db.prepare(`
      INSERT INTO human_reviews (
        id, case_id, evidence_id, action, original_value_json,
        corrected_value_json, reason, reviewer_id, created_at
      ) VALUES (?, ?, ?, 'correct_value', ?, ?, ?, ?, ?)
    `).run(
      reviewId,
      caseId,
      evidenceId,
      JSON.stringify(originalValues),
      JSON.stringify({ [payload.fieldToCorrect]: payload.correctedValue }),
      payload.reason,
      reviewerId,
      now
    );

    await recordTimelineEvent({
      caseId,
      eventType: 'evidence_corrected',
      description: `Evidence ${original.evidence_ref} corrected by ${lawyerName} (${payload.fieldToCorrect} -> ${payload.correctedValue}). Reason: ${payload.reason}`,
      source: original.evidence_ref,
      actorType: 'lawyer',
      actorId: reviewerId,
      guardianVisible: false,
      meta: { originalId: evidenceId, newEvidenceId, field: payload.fieldToCorrect }
    });

    await logAudit({
      actorId: reviewerId,
      action: 'evidence_correct_value',
      entityType: 'evidence',
      entityId: evidenceId,
      caseId,
      details: { field: payload.fieldToCorrect, newValue: payload.correctedValue }
    });

    // Enqueue reanalysis
    await enqueueJob(caseId, 'reanalyze_after_review');
    return { reviewId, newEvidenceId, status: 'corrected' };
  }

  throw new Error('Unsupported review action');
}

export async function runHumanReviewReanalysis(jobId: string, caseId: string) {
  const db = await getDb();
  const adapter = getActiveStateAdapter();

  const caseState = await buildCaseStateFromDb(caseId);
  const activeEv = caseState.evidence.filter(e => e.status === 'active');
  const evaluatedConflicts = evaluateDeterministicConflicts(activeEv);
  const evaluatedMissing = evaluateMissingEvidenceRules(caseState.claims, activeEv);

  // Update conflict statuses
  const existingConflicts = db.prepare<any>('SELECT * FROM conflicts WHERE case_id = ?').all(caseId);
  const priorVersionNo = db.prepare<any>('SELECT MAX(version_no) as v FROM analysis_versions WHERE case_id = ?').get(caseId)?.v || 0;
  const newVersionNo = priorVersionNo + 1;

  for (const ec of existingConflicts) {
    // If the conflict is no longer found in evaluated conflicts, mark resolved_by_correction
    const stillPresent = evaluatedConflicts.some(
      c => c.conflictType === ec.conflict_type &&
        ((c.evidenceAId === ec.evidence_a_id && c.evidenceBId === ec.evidence_b_id) ||
         (c.evidenceAId === ec.evidence_b_id && c.evidenceBId === ec.evidence_a_id))
    );

    if (!stillPresent && ec.status === 'open') {
      db.prepare("UPDATE conflicts SET status = 'resolved_by_correction', resolved_in_version = ?, updated_at = ? WHERE id = ?").run(
        newVersionNo,
        new Date().toISOString(),
        ec.id
      );

      await recordTimelineEvent({
        caseId,
        eventType: 'conflict_resolved',
        description: `Conflict ${ec.conflict_ref} resolved following evidence correction.`,
        source: ec.conflict_ref,
        actorType: 'system',
        guardianVisible: false
      });
    }
  }

  // Check for any newly introduced conflicts from the corrected values
  let nextConflictIdx = (db.prepare<any>('SELECT COUNT(*) as c FROM conflicts WHERE case_id = ?').get(caseId)?.c || 0) + 1;
  for (const nc of evaluatedConflicts) {
    const existing = db.prepare<any>(`
      SELECT id FROM conflicts
      WHERE case_id = ? AND conflict_type = ?
        AND ((evidence_a_id = ? AND evidence_b_id = ?) OR (evidence_a_id = ? AND evidence_b_id = ?))
    `).get(caseId, nc.conflictType, nc.evidenceAId, nc.evidenceBId, nc.evidenceBId, nc.evidenceAId);

    if (!existing) {
      const cRef = `C-${String(nextConflictIdx).padStart(3, '0')}`;
      nextConflictIdx++;
      db.prepare(`
        INSERT INTO conflicts (
          id, case_id, conflict_ref, conflict_type, evidence_a_id, evidence_b_id,
          description, why_it_matters, severity, severity_basis, status,
          detected_in_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        caseId,
        cRef,
        nc.conflictType,
        nc.evidenceAId,
        nc.evidenceBId,
        nc.description,
        nc.whyItMatters,
        nc.severity,
        nc.severityBasis,
        newVersionNo,
        new Date().toISOString(),
        new Date().toISOString()
      );
    }
  }

  // Run Reconciliation Agent with delta
  const refreshedState = await buildCaseStateFromDb(caseId);
  const openConfs = refreshedState.conflicts.filter(c => c.status === 'open');
  const openMiss = refreshedState.missingEvidence.filter(m => m.status === 'open');

  const reasoningResult = await runReconciliationAgent(
    refreshedState,
    activeEv,
    openConfs,
    openMiss,
    { trigger: 'human_correction', detail: 'Human counsel submitted corrections to evidence facts.' }
  );

  const versionId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO analysis_versions (
      id, case_id, version_no, trigger, trigger_ref, summary_text,
      assessment_status, reasoning_json, evidence_snapshot_json,
      conflict_snapshot_json, missing_snapshot_json, state_diff_json,
      model_used, created_at
    ) VALUES (?, ?, ?, 'human_correction', 'counsel_correction', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    versionId,
    caseId,
    newVersionNo,
    reasoningResult.summary,
    reasoningResult.assessment_status,
    JSON.stringify({
      findings: reasoningResult.findings,
      open_questions: reasoningResult.open_questions
    }),
    JSON.stringify(activeEv.map(e => ({ id: e.id, ref: e.ref, status: e.status }))),
    JSON.stringify(openConfs.map(c => ({ id: c.id, ref: c.ref, status: c.status }))),
    JSON.stringify(openMiss.map(m => ({ id: m.id, ref: m.ref, status: m.status }))),
    JSON.stringify(reasoningResult.changed_since_previous),
    reasoningResult.model_used,
    new Date().toISOString()
  );

  const finalState = await buildCaseStateFromDb(caseId);
  await adapter.save(caseId, finalState);

  await recordTimelineEvent({
    caseId,
    eventType: 'reanalysis_completed',
    description: `Analysis Version v${newVersionNo} created following human correction.`,
    source: `v${newVersionNo}`,
    actorType: 'system',
    guardianVisible: false,
    meta: { versionNo: newVersionNo }
  });

  await updateCaseStatusIfNeeded(caseId);

  // Counsel modified evidence values: version lock invalidates prior sign-offs.
  await invalidateSignoffs(caseId, 'Counsel corrected evidence values; version lock invalidated prior sign-offs.');

  try {
    const actorId = db.prepare<any>('SELECT assigned_lawyer_id FROM cases WHERE id = ?').get(caseId)?.assigned_lawyer_id;
    if (actorId) await runScheduledCaseAgents(caseId, actorId);
  } catch {
    console.warn('[CaseAgents] Automated agents were deferred; the reviewed analysis remains available.');
  }

  db.prepare("UPDATE jobs SET status = 'done', step = 'done', finished_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    jobId
  );
}

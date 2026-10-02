import crypto from 'crypto';
import { getDb } from '../db/client.js';
import { extractDocumentText } from '../documents/extractText.js';
import { chunkPageText } from '../documents/chunk.js';
import { extractEvidenceFromDocument } from './evidenceAgent.js';
import { evaluateDeterministicConflicts } from './rules/conflictRules.js';
import { evaluateMissingEvidenceRules } from './rules/requirementRules.js';
import { runReconciliationAgent } from './reconciliationAgent.js';
import { getActiveStateAdapter } from './state/omegaAdapter.js';
import { buildCaseStateFromDb, CaseState } from './state/caseState.js';
import { recordTimelineEvent } from './timelineAgent.js';
import { createNotification } from '../notifications/service.js';
import { updateCaseStatusIfNeeded } from '../cases/status.js';
import { logAudit } from '../audit/auditLog.js';
import { logPipelineStage, PipelineLogContext } from './pipelineLog.js';
import { runMultiAgentPipeline } from './agentRuntime.js';
import { detectLanguage } from '../i18n/languages.js';
import { translateToEnglish } from '../i18n/translateService.js';
import { upsertOcrResult } from '../ocr/ocrService.js';
import { persistSuggestedClusters } from '../entities/entityService.js';
import { invalidateSignoffs } from '../versions/signoffService.js';
import { runScheduledCaseAgents, markEvidenceRequestReadyForReview } from './caseAgents.js';

export type JobStep =
  | 'uploading'
  | 'extracting'
  | 'structuring'
  | 'validating'
  | 'checking_conflicts'
  | 'updating_case_state'
  | 'generating_analysis'
  | 'done';

export async function setJobStep(jobId: string, step: JobStep, logMessage: string) {
  const db = await getDb();
  const job = db.prepare<any>('SELECT step_log_json FROM jobs WHERE id = ?').get(jobId);
  const logs = job?.step_log_json ? JSON.parse(job.step_log_json) : [];
  logs.push({ step, timestamp: new Date().toISOString(), message: logMessage });

  db.prepare(`
    UPDATE jobs SET step = ?, step_log_json = ?, started_at = COALESCE(started_at, ?)
    WHERE id = ?
  `).run(step, JSON.stringify(logs), new Date().toISOString(), jobId);
}

export async function processDocumentPipeline(jobId: string, caseId: string, documentId: string) {
  const db = await getDb();
  const adapter = getActiveStateAdapter();
  let logContext: PipelineLogContext | null = null;
  let stageStartedAt = Date.now();
  const logStage = (stage: string, parser?: string, details: Record<string, unknown> = {}) => {
    if (!logContext) return;
    logPipelineStage(stage, {
      ...logContext,
      parser: parser || logContext.parser,
      startedAt: stageStartedAt
    }, details);
  };

  try {
    const doc = db.prepare<any>('SELECT * FROM documents WHERE id = ?').get(documentId);
    if (!doc) throw new Error('Document not found');
    const caseRow = db.prepare<any>('SELECT * FROM cases WHERE id = ?').get(caseId);
    logContext = {
      filename: doc.filename,
      documentId,
      caseId,
      parser: 'extractDocumentText',
      extractedCharacters: 0,
      evidenceCount: 0,
      conflictCount: 0,
      missingEvidenceCount: 0,
      startedAt: Date.now(),
      preview: ''
    };

    // Step 1: Extracting
    await setJobStep(jobId, 'extracting', `Extracting text layers from ${doc.filename}...`);
    db.prepare("UPDATE documents SET processing_status = 'extracting', processing_warning = NULL WHERE id = ?").run(documentId);

    stageStartedAt = Date.now();
    logStage('TEXT EXTRACTION:start');
    const extraction = await extractDocumentText(doc.storage_path, doc.mime, doc.filename, { documentId, caseId });
    const extractedText = extraction.pages.map(page => page.text).join('\n');
    if (extraction.warnings?.length) {
      db.prepare('UPDATE documents SET processing_warning = ? WHERE id = ?').run(extraction.warnings.join(' '), documentId);
    }
    const selectedParser = [...new Set(extraction.pages.map(page => page.method))].join(', ') || 'none';
    logContext.parser = selectedParser;
    logContext.extractedCharacters = extraction.totalChars;
    logContext.preview = extractedText.slice(0, 300);
    logStage('TEXT EXTRACTION:complete', selectedParser, { pageCount: extraction.pages.length });
    if ((extraction.pages.length === 0 || extraction.totalChars === 0) && !extraction.warnings?.length) {
      const message = `Document text extraction returned no text for "${doc.filename}" (MIME: ${doc.mime}; parser: ${selectedParser}).`;
      db.prepare("UPDATE documents SET processing_status = 'failed', failure_reason = ? WHERE id = ?").run(message, documentId);
      throw new Error(message);
    }
    if (extraction.warnings?.length) {
      logStage('OCR:manual review required', selectedParser, { warningCount: extraction.warnings.length });
    }

    // Save pages & chunks
    db.prepare('DELETE FROM document_pages WHERE document_id = ?').run(documentId);
    db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);

    for (const page of extraction.pages) {
      const pageId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO document_pages (id, document_id, page_no, text, extraction_method, char_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(pageId, documentId, page.pageNo, page.text, page.method, page.text.length);

      const chunks = chunkPageText(page.text, page.pageNo);
      for (const ch of chunks) {
        db.prepare(`
          INSERT INTO chunks (id, document_id, page_no, chunk_index, text, char_start, char_end)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(crypto.randomUUID(), documentId, page.pageNo, ch.chunkIndex, ch.text, ch.charStart, ch.charEnd);
      }
    }

    db.prepare('UPDATE documents SET page_count = ? WHERE id = ?').run(extraction.pages.length, documentId);

    // Multilingual sidecar: preserve original language per page, store English
    // translation (Gemini when available, deterministic fallback otherwise),
    // and persist OCR results with confidence + highlights for scans/photos.
    try {
      const now = new Date().toISOString();
      for (const page of extraction.pages) {
        const sourceLanguage = detectLanguage(page.text);
        try {
          const translation = await translateToEnglish(page.text);
          db.prepare(`INSERT OR REPLACE INTO document_translations
            (id, document_id, page_no, source_language, original_text, english_text, provider, confidence, created_at)
            VALUES (COALESCE((SELECT id FROM document_translations WHERE document_id = ? AND page_no = ?), ?), ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(documentId, page.pageNo, crypto.randomUUID(), documentId, page.pageNo,
              sourceLanguage, page.text, translation.englishText, translation.provider, translation.confidence, now);
        } catch (translationError) {
          console.warn(`[i18n] translation sidecar failed for ${documentId} p${page.pageNo}:`, translationError);
        }
        try {
          const isImageLike = page.method === 'gemini_ocr' || doc.mime.startsWith('image/');
          const confidence = page.method === 'gemini_ocr' ? 0.88 : page.text.trim() ? 0.75 : 0;
          await upsertOcrResult(documentId, page.pageNo, page.text, confidence,
            page.text.trim() ? page.method : 'deterministic_fallback');
          void isImageLike;
        } catch (ocrError) {
          console.warn(`[ocr] sidecar failed for ${documentId} p${page.pageNo}:`, ocrError);
        }
      }
    } catch (sidecarError) {
      console.warn('[pipeline] multilingual/OCR sidecar skipped:', sidecarError);
    }

    // Step 2: Structuring (Agent 1)
    await setJobStep(jobId, 'structuring', 'Evidence Intelligence Agent extracting structured facts & verbatim quotes...');
    db.prepare("UPDATE documents SET processing_status = 'structuring' WHERE id = ?").run(documentId);

    stageStartedAt = Date.now();
    logStage('STRUCTURING:start', selectedParser);
    const extractionResult = await extractEvidenceFromDocument(extraction.pages, {
      filename: doc.filename,
      documentId,
      caseId
    });
    logContext.evidenceCount = extractionResult.evidence.length;
    logStage('STRUCTURING:complete', selectedParser, {
      claimCount: extractionResult.claims.length,
      rejectedUngroundedCount: extractionResult.rejectionCount
    });

    // Step 3: Validating
    await setJobStep(jobId, 'validating', `Validating grounding for ${extractionResult.evidence.length} evidence candidate(s)...`);
    db.prepare("UPDATE documents SET processing_status = 'validating' WHERE id = ?").run(documentId);

    const evidenceForPersistence = [...extractionResult.evidence];
    const claimsForPersistence = extractionResult.claims.map(claim => {
      let evidence = evidenceForPersistence.find(item =>
        item.pageNo === claim.pageNo &&
        (item.sourceQuote.includes(claim.sourceQuote) || claim.sourceQuote.includes(item.sourceQuote))
      );
      if (!evidence) {
        evidence = {
          evidenceType: 'statement',
          factLabel: 'Claim Statement',
          factText: claim.claimText,
          entity: null,
          dateValue: null,
          dateRaw: null,
          amountValue: null,
          currency: null,
          amountRaw: null,
          sourceQuote: claim.sourceQuote,
          pageNo: claim.pageNo,
          confidence: 0.9,
          confidenceBasis: { exact_source_quote: 0.9, claim_source: 0.1 }
        };
        evidenceForPersistence.push(evidence);
      }
      return { claim, evidence };
    });

    stageStartedAt = Date.now();
    logContext.evidenceCount = evidenceForPersistence.length;
    logStage('VALIDATION:start', 'exact source quote validation');
    const sourceTextByPage = new Map(extraction.pages.map(page => [page.pageNo, page.text]));
    const invalidEvidence = evidenceForPersistence.filter(item => !sourceTextByPage.get(item.pageNo)?.includes(item.sourceQuote));
    if (invalidEvidence.length > 0) {
      throw new Error(`Grounding validation rejected ${invalidEvidence.length} evidence item(s) for ${doc.filename}.`);
    }
    const invalidClaims = claimsForPersistence.filter(({ claim }) => !sourceTextByPage.get(claim.pageNo)?.includes(claim.sourceQuote));
    if (invalidClaims.length > 0) {
      throw new Error(`Grounding validation rejected ${invalidClaims.length} claim(s) for ${doc.filename}.`);
    }
    logStage('GROUNDING:complete', 'exact source quote validation', {
      validatedEvidenceCount: evidenceForPersistence.length,
      validatedClaimCount: claimsForPersistence.length
    });

    const existingEvCount = db.prepare<any>('SELECT COUNT(*) as c FROM evidence WHERE case_id = ?').get(caseId)?.c || 0;
    let nextEvIndex = existingEvCount + 1;
    const evidenceIdByItem = new Map<typeof evidenceForPersistence[number], string>();
    const evidenceIds: string[] = [];
    const saveEvidence = db.transaction(() => {
      for (const item of evidenceForPersistence) {
        const evId = crypto.randomUUID();
        evidenceIds.push(evId);
        evidenceIdByItem.set(item, evId);
        const evRef = `E-${String(nextEvIndex).padStart(3, '0')}`;
        nextEvIndex++;
        db.prepare(`
          INSERT INTO evidence (
            id, case_id, evidence_ref, document_id, page_no, evidence_type,
            fact_label, fact_text, entity, date_value, date_raw,
            amount_value, currency, amount_raw, source_quote, confidence,
            confidence_basis, status, created_by, validation_notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'evidence_agent', ?, ?)
        `).run(
          evId, caseId, evRef, documentId, item.pageNo, item.evidenceType,
          item.factLabel, item.factText, item.entity || null, item.dateValue || null, item.dateRaw || null,
          item.amountValue ?? null, item.currency || null, item.amountRaw || null, item.sourceQuote,
          item.confidence ?? null, item.confidenceBasis ? JSON.stringify(item.confidenceBasis) : null,
          item.validationNotes || null, new Date().toISOString()
        );
      }

      for (const { claim, evidence } of claimsForPersistence) {
        const sourceEvidenceId = evidenceIdByItem.get(evidence);
        if (!sourceEvidenceId) throw new Error(`No evidence record was prepared for claim: ${claim.claimText}`);
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO claims (id, case_id, claim_text, claim_source_evidence_id, claim_kind, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'unverified', ?, ?)
        `).run(crypto.randomUUID(), caseId, claim.claimText, sourceEvidenceId, claim.claimKind, now, now);
      }
    });

    stageStartedAt = Date.now();
    logStage('DATABASE SAVE:start', 'SQLite transaction');
    saveEvidence();
    const persistedEvidenceCount = evidenceIds.reduce((count, id) =>
      count + Number(Boolean(db.prepare('SELECT id FROM evidence WHERE id = ? AND document_id = ?').get(id, documentId))), 0);
    if (persistedEvidenceCount !== evidenceForPersistence.length) {
      throw new Error(`Evidence persistence mismatch for ${doc.filename}: expected ${evidenceForPersistence.length}, saved ${persistedEvidenceCount}.`);
    }
    logContext.evidenceCount = persistedEvidenceCount;
    logStage('DATABASE SAVE:complete', 'SQLite transaction', { persistedClaimCount: claimsForPersistence.length });

    stageStartedAt = Date.now();
    await recordTimelineEvent({
      caseId,
      eventType: 'evidence_structured',
      description: `Extracted ${persistedEvidenceCount} grounded evidence items from ${doc.filename}.`,
      source: doc.filename,
      actorType: 'system',
      guardianVisible: false,
      meta: { documentId, count: persistedEvidenceCount }
    });
    logStage('TIMELINE UPDATE:evidence', selectedParser);

    // Step 4: Checking Conflicts & Missing Evidence
    await setJobStep(jobId, 'checking_conflicts', 'Executing deterministic conflict rules and corroboration engines...');
    const allCaseEvidence = (await buildCaseStateFromDb(caseId)).evidence;
    const allClaims = (await buildCaseStateFromDb(caseId)).claims;

    const evaluatedConflicts = evaluateDeterministicConflicts(allCaseEvidence);
    const evaluatedMissing = evaluateMissingEvidenceRules(allClaims, allCaseEvidence);
    stageStartedAt = Date.now();
    logContext.conflictCount = evaluatedConflicts.length;
    logContext.missingEvidenceCount = evaluatedMissing.filter(item => item.status === 'open').length;
    logStage('CONFLICTS:computed', 'deterministic conflict rules', {
      evaluatedConflictCount: evaluatedConflicts.length,
      evaluatedMissingEvidenceCount: evaluatedMissing.length
    });

    // Persist conflicts
    const priorVersionNo = db.prepare<any>('SELECT MAX(version_no) as v FROM analysis_versions WHERE case_id = ?').get(caseId)?.v || 0;
    let nextConflictIndex = (db.prepare<any>('SELECT COUNT(*) as c FROM conflicts WHERE case_id = ?').get(caseId)?.c || 0) + 1;

    for (const ec of evaluatedConflicts) {
      const existing = db.prepare<any>(`
        SELECT id FROM conflicts
        WHERE case_id = ? AND conflict_type = ?
          AND ((evidence_a_id = ? AND evidence_b_id = ?) OR (evidence_a_id = ? AND evidence_b_id = ?))
      `).get(caseId, ec.conflictType, ec.evidenceAId, ec.evidenceBId, ec.evidenceBId, ec.evidenceAId);

      if (!existing) {
        const cRef = `C-${String(nextConflictIndex).padStart(3, '0')}`;
        nextConflictIndex++;
        const confId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO conflicts (
            id, case_id, conflict_ref, conflict_type, evidence_a_id, evidence_b_id,
            description, why_it_matters, severity, severity_basis, status,
            detected_in_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
        `).run(
          confId,
          caseId,
          cRef,
          ec.conflictType,
          ec.evidenceAId,
          ec.evidenceBId,
          ec.description,
          ec.whyItMatters,
          ec.severity,
          ec.severityBasis,
          priorVersionNo + 1,
          new Date().toISOString(),
          new Date().toISOString()
        );

        stageStartedAt = Date.now();
        await recordTimelineEvent({
          caseId,
          eventType: 'conflict_detected',
          description: `Conflict ${cRef} detected: ${ec.description}`,
          source: cRef,
          actorType: 'system',
          guardianVisible: false,
          meta: { conflictRef: cRef, type: ec.conflictType }
        });
        logStage('TIMELINE UPDATE:conflict', selectedParser);

        if (caseRow) {
          await createNotification({
            userId: caseRow.assigned_lawyer_id,
            caseId,
            kind: 'conflict_detected',
            title: `Conflict Detected: ${cRef}`,
            body: `${ec.description} (Severity: ${ec.severity})`
          });
        }
      }
    }
    logContext.conflictCount = db.prepare<any>("SELECT COUNT(*) as c FROM conflicts WHERE case_id = ? AND status = 'open'").get(caseId)?.c || 0;
    logStage('DATABASE SAVE:conflicts', 'SQLite', { evaluatedConflictCount: evaluatedConflicts.length });

    // Persist Missing Evidence items
    let nextMissingIndex = (db.prepare<any>('SELECT COUNT(*) as c FROM missing_evidence WHERE case_id = ?').get(caseId)?.c || 0) + 1;
    for (const em of evaluatedMissing) {
      const existing = db.prepare<any>(`
        SELECT id, status FROM missing_evidence
        WHERE case_id = ? AND claim_id = ? AND required_item = ?
      `).get(caseId, em.claimId, em.requiredItem);

      if (!existing && em.status === 'open') {
        const mRef = `M-${String(nextMissingIndex).padStart(3, '0')}`;
        nextMissingIndex++;
        db.prepare(`
          INSERT INTO missing_evidence (
            id, case_id, missing_ref, claim_id, required_item, rationale,
            basis_evidence_ids, status, detected_in_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          caseId,
          mRef,
          em.claimId || null,
          em.requiredItem,
          em.rationale,
          JSON.stringify(em.basisEvidenceIds),
          priorVersionNo + 1,
          new Date().toISOString(),
          new Date().toISOString()
        );

        stageStartedAt = Date.now();
        await recordTimelineEvent({
          caseId,
          eventType: 'missing_evidence_identified',
          description: `Missing evidence item ${mRef}: ${em.requiredItem}`,
          source: mRef,
          actorType: 'system',
          guardianVisible: false
        });
        logStage('TIMELINE UPDATE:missing evidence', selectedParser);
      } else if (existing && existing.status === 'open' && em.status === 'satisfied') {
        db.prepare("UPDATE missing_evidence SET status = 'satisfied', updated_at = ? WHERE id = ?").run(
          new Date().toISOString(),
          existing.id
        );

        stageStartedAt = Date.now();
        await recordTimelineEvent({
          caseId,
          eventType: 'missing_evidence_satisfied',
          description: `Missing evidence item satisfied by new corroborating upload.`,
          actorType: 'system',
          guardianVisible: false
        });
        logStage('TIMELINE UPDATE:missing evidence satisfied', selectedParser);
      }
    }
    logContext.missingEvidenceCount = db.prepare<any>("SELECT COUNT(*) as c FROM missing_evidence WHERE case_id = ? AND status = 'open'").get(caseId)?.c || 0;
    logStage('DATABASE SAVE:missing evidence', 'SQLite', { evaluatedMissingEvidenceCount: evaluatedMissing.length });

    // Entity resolution sidecar: auto-merge FTPL / Fictional Traders Pvt Ltd /
    // M/s Fictional Traders / ABC Ltd / ABC Limited style aliases for review.
    try {
      const entityMentions = db.prepare<any>(
        "SELECT entity FROM evidence WHERE case_id = ? AND status = 'active' AND entity IS NOT NULL AND entity != ''"
      ).all(caseId).map(r => r.entity as string);
      if (entityMentions.length > 0) {
        await persistSuggestedClusters(caseId, entityMentions);
        logStage('ENTITIES:clustered', 'deterministic + gemini entity resolution');
      }
    } catch (entityError) {
      console.warn('[pipeline] entity-resolution sidecar skipped:', entityError);
    }

    // New document content changes the evidence base: invalidate prior
    // version sign-offs automatically (version lock).
    try {
      const n = await invalidateSignoffs(caseId, `New document "${doc.filename}" ingested; evidence base changed.`);
      if (n > 0) logStage('VERSION LOCK:sign-offs invalidated', 'version_signoffs', { invalidated: n });
    } catch (e) { console.warn('[version-lock] invalidate skipped:', e); }

    const multiAgentResults = await runMultiAgentPipeline({
      caseId,
      documentId,
      documentName: doc.filename,
      text: extractedText,
      evidence: allCaseEvidence,
      conflicts: evaluatedConflicts,
      missingEvidence: evaluatedMissing
    });
    if (!multiAgentResults.length || multiAgentResults.some(result => result.status === 'failed')) {
      console.warn(`[AgentRuntime:${doc.filename}] Multi-agent pipeline degraded but did not halt the case flow.`, multiAgentResults);
    }

    // Step 5: Updating Case State (Adapter)
    await setJobStep(jobId, 'updating_case_state', 'Synchronizing CaseState to persistent store...');
    stageStartedAt = Date.now();
    logStage('CASE UPDATE:state start', adapter.name);
    const intermediateState = await buildCaseStateFromDb(caseId);
    await adapter.save(caseId, intermediateState);
    logStage('CASE UPDATE:state complete', adapter.name, { stateVersion: intermediateState.stateVersion });

    // Step 6: Generating Analysis (Agent 2)
    await setJobStep(jobId, 'generating_analysis', 'Reconciliation Agent generating auditable legal reasoning trace...');

    const latestState = await buildCaseStateFromDb(caseId);
    const activeEv = latestState.evidence.filter(e => e.status === 'active');
    const openConfs = latestState.conflicts.filter(c => c.status === 'open');
    const openMiss = latestState.missingEvidence.filter(m => m.status === 'open');

    stageStartedAt = Date.now();
    logStage('AI REASONING:start', selectedParser);
    const reasoningResult = await runReconciliationAgent(
      latestState,
      activeEv,
      openConfs,
      openMiss,
      { trigger: 'document_processed', triggerRef: doc.filename, detail: `Document ${doc.filename} added.` }
    );
    logStage('AI REASONING:complete', reasoningResult.model_used, {
      findingCount: reasoningResult.findings.length,
      assessmentStatus: reasoningResult.assessment_status
    });

    const newVersionNo = priorVersionNo + 1;
    const versionId = crypto.randomUUID();

    const saveAnalysis = db.transaction(() => db.prepare(`
      INSERT INTO analysis_versions (
        id, case_id, version_no, trigger, trigger_ref, summary_text,
        assessment_status, reasoning_json, evidence_snapshot_json,
        conflict_snapshot_json, missing_snapshot_json, state_diff_json,
        model_used, created_at
      ) VALUES (?, ?, ?, 'document_processed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId,
      caseId,
      newVersionNo,
      doc.filename,
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
    ));
    stageStartedAt = Date.now();
    saveAnalysis();
    const savedAnalysis = db.prepare('SELECT id FROM analysis_versions WHERE id = ? AND case_id = ?').get(versionId, caseId);
    if (!savedAnalysis) throw new Error(`Analysis version ${versionId} was not persisted for ${doc.filename}.`);
    logStage('DATABASE SAVE:analysis', 'SQLite transaction', { versionId });

    // Final save of state
    const finalState = await buildCaseStateFromDb(caseId);
    await adapter.save(caseId, finalState);

    stageStartedAt = Date.now();
    await recordTimelineEvent({
      caseId,
      eventType: 'assessment_updated',
      description: `Analysis Version v${newVersionNo} generated (${reasoningResult.assessment_status.replace(/_/g, ' ')}).`,
      source: `v${newVersionNo}`,
      actorType: 'system',
      guardianVisible: false,
      meta: { versionNo: newVersionNo, status: reasoningResult.assessment_status }
    });
    logStage('TIMELINE UPDATE:analysis', selectedParser);

    // Step 7: Done
    db.prepare("UPDATE documents SET processing_status = 'done', failure_reason = NULL WHERE id = ?").run(documentId);
    stageStartedAt = Date.now();
    await updateCaseStatusIfNeeded(caseId);
    logContext.evidenceCount = db.prepare<any>("SELECT COUNT(*) as c FROM evidence WHERE case_id = ? AND status = 'active'").get(caseId)?.c || 0;
    logContext.conflictCount = db.prepare<any>("SELECT COUNT(*) as c FROM conflicts WHERE case_id = ? AND status = 'open'").get(caseId)?.c || 0;
    logContext.missingEvidenceCount = db.prepare<any>("SELECT COUNT(*) as c FROM missing_evidence WHERE case_id = ? AND status = 'open'").get(caseId)?.c || 0;
    logStage('CASE UPDATE:metrics', selectedParser, { analysisVersion: newVersionNo });

    await logAudit({
      actorId: doc.uploaded_by,
      action: 'process_document_complete',
      entityType: 'document',
      entityId: documentId,
      caseId,
      details: { versionNo: newVersionNo }
    });

    try {
      await markEvidenceRequestReadyForReview(caseId, documentId);
      await runScheduledCaseAgents(caseId, doc.uploaded_by);
    } catch (agentError) {
      console.warn('[CaseAgents] Automated agents were deferred; the case analysis remains available.');
    }

    await setJobStep(jobId, 'done', 'Document analysis and case reconciliation completed successfully.');
    db.prepare("UPDATE jobs SET status = 'done', finished_at = ? WHERE id = ?").run(new Date().toISOString(), jobId);
    logStage('PIPELINE:complete', selectedParser, { jobId, analysisVersion: newVersionNo });
  } catch (err: any) {
    console.error(`[Job ${jobId} Failed]:`, err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    logStage('PIPELINE:error', logContext?.parser || 'unknown', { jobId, error: errorMessage });
    if (documentId) {
      db.prepare("UPDATE documents SET processing_status = 'failed', failure_reason = ? WHERE id = ?").run(
        errorMessage,
        documentId
      );
    }
    await setJobStep(jobId, 'done', `Pipeline failed: ${errorMessage}`);
    db.prepare("UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(
      errorMessage,
      new Date().toISOString(),
      jobId
    );
    await updateCaseStatusIfNeeded(caseId);
  }
}

export async function runManualAnalysis(caseId: string, actorId: string): Promise<string> {
  const db = await getDb();
  const adapter = getActiveStateAdapter();

  const latestState = await buildCaseStateFromDb(caseId);
  const activeEv = latestState.evidence.filter(e => e.status === 'active');
  const openConfs = latestState.conflicts.filter(c => c.status === 'open');
  const openMiss = latestState.missingEvidence.filter(m => m.status === 'open');

  const reasoningResult = await runReconciliationAgent(
    latestState,
    activeEv,
    openConfs,
    openMiss,
    { trigger: 'manual_run', triggerRef: 'lawyer_request', detail: 'Explicit analysis run triggered by counsel.' }
  );

  const priorVersionNo = db.prepare<any>('SELECT MAX(version_no) as v FROM analysis_versions WHERE case_id = ?').get(caseId)?.v || 0;
  const newVersionNo = priorVersionNo + 1;
  const versionId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO analysis_versions (
      id, case_id, version_no, trigger, trigger_ref, summary_text,
      assessment_status, reasoning_json, evidence_snapshot_json,
      conflict_snapshot_json, missing_snapshot_json, state_diff_json,
      model_used, created_at
    ) VALUES (?, ?, ?, 'manual_run', 'counsel_request', ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    description: `Analysis Version v${newVersionNo} generated via manual review.`,
    source: `v${newVersionNo}`,
    actorType: 'lawyer',
    actorId,
    guardianVisible: false,
    meta: { versionNo: newVersionNo }
  });

  await updateCaseStatusIfNeeded(caseId, actorId);
  try {
    await runScheduledCaseAgents(caseId, actorId);
  } catch {
    console.warn('[CaseAgents] Automated agents were deferred; the manual case analysis remains available.');
  }
  return versionId;
}

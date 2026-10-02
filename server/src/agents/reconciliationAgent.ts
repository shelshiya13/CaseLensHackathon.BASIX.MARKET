import { Type } from '@google/genai';
import { disableGeminiForAuthenticationError, getGeminiClient } from './geminiClient.js';
import { CaseState, CaseStateEvidence, CaseStateConflict, CaseStateMissingEvidence } from './state/caseState.js';
import { REASONING_SYSTEM_INSTRUCTION } from './prompts/evidence.js';
import { env } from '../config/env.js';

export interface ReasoningFinding {
  finding_id: string;
  statement: string;
  evidence_refs: string[];
  rule_or_fact_applied: string;
  conflict_refs: string[];
  missing_refs: string[];
  impact: string;
  status: 'supported' | 'contradicted' | 'unverified' | 'insufficient';
}

export interface StateDiffItem {
  finding_id: string;
  was: string;
  now: string;
  because: string;
}

export interface ReconciliationResult {
  assessment_status: 'insufficient_evidence' | 'conflict_detected' | 'missing_evidence' | 'verified_consistent' | 'human_review_required';
  summary: string;
  findings: ReasoningFinding[];
  unchanged_since_previous: string[];
  changed_since_previous: StateDiffItem[];
  open_questions: string[];
  model_used: string;
}

export async function runReconciliationAgent(
  priorState: CaseState,
  activeEvidence: CaseStateEvidence[],
  openConflicts: CaseStateConflict[],
  openMissing: CaseStateMissingEvidence[],
  triggerContext: { trigger: string; triggerRef?: string; detail?: string }
): Promise<ReconciliationResult> {
  const validEvidenceRefs = new Set(activeEvidence.map(e => e.ref));
  const validConflictRefs = new Set(openConflicts.map(c => c.ref));
  const validMissingRefs = new Set(openMissing.map(m => m.ref));

  if (activeEvidence.length === 0) {
    return {
      assessment_status: 'insufficient_evidence',
      summary: 'Insufficient evidence. Upload evidence to begin AI-assisted analysis.',
      findings: [],
      unchanged_since_previous: [],
      changed_since_previous: [],
      open_questions: ['No active evidence records found in the case record.'],
      model_used: 'rule_engine'
    };
  }

  // Derive initial status based on conflicts & missing items
  let derivedStatus: 'insufficient_evidence' | 'conflict_detected' | 'missing_evidence' | 'verified_consistent' | 'human_review_required' = 'verified_consistent';
  if (openConflicts.length > 0) {
    derivedStatus = 'conflict_detected';
  } else if (openMissing.length > 0) {
    derivedStatus = 'missing_evidence';
  }

  const ai = getGeminiClient();
  let aiOutput: any = null;
  let usedGemini = false;

  if (ai) {
    const compactPrior = {
      priorAssessmentVersion: priorState.currentAssessment?.versionNo || 0,
      priorStatus: priorState.currentAssessment?.status || 'none',
      priorSummary: priorState.currentAssessment?.summary || '',
      priorFindings: priorState.currentAssessment?.findings || []
    };

    const evidenceSummary = activeEvidence.map(e => ({
      ref: e.ref,
      type: e.type,
      fact: e.fact,
      entity: e.entity,
      date: e.date || e.dateRaw,
      amount: e.amountRaw,
      quote: e.sourceQuote
    }));

    const conflictSummary = openConflicts.map(c => ({
      ref: c.ref,
      type: c.conflictType,
      whyItMatters: c.whyItMatters,
      description: c.description
    }));

    const missingSummary = openMissing.map(m => ({
      ref: m.ref,
      required: m.requiredItem,
      rationale: m.rationale
    }));

    const userPrompt = `
Analyze the case state and current evidence set.
Trigger for this evaluation: ${triggerContext.trigger} (${triggerContext.triggerRef || 'direct'}). ${triggerContext.detail || ''}

PRIOR CASE STATE SUMMARY:
${JSON.stringify(compactPrior, null, 2)}

ACTIVE EVIDENCE (Use ONLY these references):
${JSON.stringify(evidenceSummary, null, 2)}

CURRENT DETECTED CONFLICTS:
${JSON.stringify(conflictSummary, null, 2)}

CURRENT MISSING EVIDENCE ITEMS:
${JSON.stringify(missingSummary, null, 2)}
`;

    try {
      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction: REASONING_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              assessment_status: { type: Type.STRING },
              summary: { type: Type.STRING },
              findings: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    finding_id: { type: Type.STRING },
                    statement: { type: Type.STRING },
                    evidence_refs: { type: Type.ARRAY, items: { type: Type.STRING } },
                    rule_or_fact_applied: { type: Type.STRING },
                    conflict_refs: { type: Type.ARRAY, items: { type: Type.STRING } },
                    missing_refs: { type: Type.ARRAY, items: { type: Type.STRING } },
                    impact: { type: Type.STRING },
                    status: { type: Type.STRING }
                  },
                  required: ['finding_id', 'statement', 'evidence_refs', 'rule_or_fact_applied', 'impact', 'status']
                }
              },
              unchanged_since_previous: { type: Type.ARRAY, items: { type: Type.STRING } },
              changed_since_previous: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    finding_id: { type: Type.STRING },
                    was: { type: Type.STRING },
                    now: { type: Type.STRING },
                    because: { type: Type.STRING }
                  },
                  required: ['finding_id', 'was', 'now', 'because']
                }
              },
              open_questions: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['assessment_status', 'summary', 'findings']
          }
        }
      });

      const parsedOutput = JSON.parse(response.text || '{}');
      if (Array.isArray(parsedOutput.findings) && typeof parsedOutput.summary === 'string') {
        aiOutput = parsedOutput;
        usedGemini = true;
      }
    } catch (err) {
      const authRejected = disableGeminiForAuthenticationError(err);
      console.warn(authRejected
        ? '[ReconciliationAgent] Gemini authentication rejected; using deterministic reasoning.'
        : '[ReconciliationAgent] Gemini reasoning call failed; using deterministic reasoning.');
    }
  }

  // If AI output unavailable or failed validation, generate deterministic reasoning
  if (!aiOutput || !Array.isArray(aiOutput.findings)) {
    aiOutput = buildDeterministicReasoning(
      activeEvidence,
      openConflicts,
      openMissing,
      priorState,
      derivedStatus
    );
  }

  // Server-side strict guardrails & citation validation
  const validatedFindings: ReasoningFinding[] = [];
  for (const f of aiOutput.findings || []) {
    // Filter to valid evidence IDs
    const validRefs = (f.evidence_refs || []).filter((ref: string) => validEvidenceRefs.has(ref));
    if (validRefs.length === 0 && f.status !== 'insufficient') {
      console.warn(`[Reasoning Guardrail] Dropped finding with zero valid evidence citations: "${f.statement}"`);
      continue;
    }

    const validC = (f.conflict_refs || []).filter((ref: string) => validConflictRefs.has(ref));
    const validM = (f.missing_refs || []).filter((ref: string) => validMissingRefs.has(ref));

    validatedFindings.push({
      finding_id: f.finding_id || `F-${validatedFindings.length + 1}`,
      statement: f.statement,
      evidence_refs: validRefs,
      rule_or_fact_applied: f.rule_or_fact_applied || 'Document evidence consistency check',
      conflict_refs: validC,
      missing_refs: validM,
      impact: f.impact || 'Requires legal counsel review',
      status: f.status || (validC.length > 0 ? 'contradicted' : (validM.length > 0 ? 'unverified' : 'supported'))
    });
  }

  // Ensure "Based on uploaded evidence" prefix is present in summary
  let summary = aiOutput.summary || '';
  if (!summary.toLowerCase().includes('based on uploaded evidence')) {
    summary = `Based on uploaded evidence, ${summary.charAt(0).toLowerCase() + summary.slice(1)}`;
  }

  // Synthesize or refine changed_since_previous
  const changedItems: StateDiffItem[] = aiOutput.changed_since_previous || [];
  if (priorState.currentAssessment && changedItems.length === 0 && (openConflicts.length > 0 || openMissing.length > 0)) {
    if (openConflicts.length > 0) {
      changedItems.push({
        finding_id: 'reconciliation_delta',
        was: priorState.currentAssessment.summary,
        now: summary,
        because: `New evidence introduced an unresolved conflict (${openConflicts.map(c => c.ref).join(', ')}) regarding amounts or contractual timelines.`
      });
    }
  }

  const modelUsed = usedGemini ? env.GEMINI_MODEL : 'rule_engine';

  return {
    assessment_status: aiOutput.assessment_status || derivedStatus,
    summary,
    findings: validatedFindings,
    unchanged_since_previous: aiOutput.unchanged_since_previous || [],
    changed_since_previous: changedItems,
    open_questions: aiOutput.open_questions || (openMissing.map(m => m.rationale)),
    model_used: modelUsed
  };
}

function buildDeterministicReasoning(
  evidence: CaseStateEvidence[],
  conflicts: CaseStateConflict[],
  missing: CaseStateMissingEvidence[],
  priorState: CaseState,
  derivedStatus: any
) {
  const findings: ReasoningFinding[] = [];
  const changed: StateDiffItem[] = [];

  // Invoices & payments
  const inv = evidence.find(e => e.type === 'invoice_total');
  const pay = evidence.find(e => e.type === 'payment');
  const contract = evidence.find(e => e.type === 'contract_term');
  const delivery = evidence.find(e => e.type === 'delivery');

  if (inv && pay) {
    const conflict = conflicts.find(c => c.conflictType === 'amount_mismatch');
    if (conflict) {
      findings.push({
        finding_id: 'F-INV-PAY-MISMATCH',
        statement: `Payment amount of ${pay.currency || '₹'} ${(pay.amount! / 100).toLocaleString()} does not match invoiced sum of ${inv.currency || '₹'} ${(inv.amount! / 100).toLocaleString()}.`,
        evidence_refs: [inv.ref, pay.ref],
        rule_or_fact_applied: 'Numerical cross-document accounting reconciliation',
        conflict_refs: [conflict.ref],
        missing_refs: [],
        impact: 'Material discrepancy in settlement balance requiring lawyer review.',
        status: 'contradicted'
      });
    } else {
      findings.push({
        finding_id: 'F-INV-PAY-CONSISTENT',
        statement: `Payment recorded corresponds with invoice total ${inv.amountRaw}.`,
        evidence_refs: [inv.ref, pay.ref],
        rule_or_fact_applied: 'Numerical payment reconciliation',
        conflict_refs: [],
        missing_refs: [],
        impact: 'Settlement accounts verified consistent across uploaded records.',
        status: 'supported'
      });
    }
  } else if (inv) {
    findings.push({
      finding_id: 'F-INV-TOTAL',
      statement: `Invoice establishes total claim of ${inv.amountRaw}.`,
      evidence_refs: [inv.ref],
      rule_or_fact_applied: 'Tax invoice liability verification',
      conflict_refs: [],
      missing_refs: missing.filter(m => m.claimId).map(m => m.ref),
      impact: 'Establishes prima facie transaction quantum.',
      status: missing.length > 0 ? 'unverified' : 'supported'
    });
  }

  if (contract && delivery) {
    const dateConflict = conflicts.find(c => c.conflictType === 'date_mismatch');
    if (dateConflict) {
      findings.push({
        finding_id: 'F-DELIVERY-DELAY',
        statement: `Delivery recorded on ${delivery.dateRaw} diverges from agreed contractual date ${contract.dateRaw}.`,
        evidence_refs: [contract.ref, delivery.ref],
        rule_or_fact_applied: 'Contractual deadline execution verification',
        conflict_refs: [dateConflict.ref],
        missing_refs: [],
        impact: 'Potential contractual breach or delay claim.',
        status: 'contradicted'
      });
    }
  }

  let summary = `Based on uploaded evidence, ${evidence.length} evidence item(s) have been verified.`;
  if (conflicts.length > 0) {
    summary = `Based on uploaded evidence, ${conflicts.length} conflict(s) detected across records. Human review required.`;
  } else if (missing.length > 0) {
    summary = `Based on uploaded evidence, corroborating documentation is pending for ${missing.length} factual assertion(s).`;
  }

  if (priorState.currentAssessment) {
    changed.push({
      finding_id: 'status_evolution',
      was: priorState.currentAssessment.summary,
      now: summary,
      because: 'New document evidence processed and integrated into persistent case state.'
    });
  }

  return {
    assessment_status: derivedStatus,
    summary,
    findings,
    unchanged_since_previous: [],
    changed_since_previous: changed,
    open_questions: missing.map(m => m.rationale)
  };
}

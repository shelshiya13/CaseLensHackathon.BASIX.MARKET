export type GroundedMode = 'ask' | 'hearing_brief' | 'counter_argument' | 'document_request';

export interface GroundedEvidenceRow {
  id?: string;
  evidence_ref: string;
  fact_label: string;
  fact_text: string;
  source_quote?: string | null;
  document_filename?: string | null;
  page_no?: number | null;
  evidence_type?: string | null;
  confidence?: number | null;
  entity?: string | null;
  date_value?: string | null;
  date_raw?: string | null;
  amount_raw?: string | null;
}

export interface GroundedConflictRow {
  conflict_ref: string;
  description: string;
  why_it_matters?: string | null;
  evidence_a_ref?: string | null;
  evidence_b_ref?: string | null;
}

export interface GroundedMissingRow {
  missing_ref?: string;
  required_item: string;
  rationale?: string | null;
  basis_evidence_ids?: string[];
}

export interface GroundedCaseContext {
  case?: { title?: string; case_ref?: string; case_type?: string; court?: string; case_number?: string } | null;
  evidence: GroundedEvidenceRow[];
  conflicts: GroundedConflictRow[];
  missing: GroundedMissingRow[];
  timeline: GroundedEvidenceRow[];
  question?: string;
}

const unsupported = 'This point is not established by the cited case evidence.';
const questionStopWords = new Set(['what','when','where','which','does','did','have','has','the','and','for','from','with','about','case','evidence','that','this','was','were','are','can','you','show','tell','support']);

function sentence(text: string, refs: string[], allowed: Set<string>): string {
  const valid = [...new Set(refs.filter(ref => allowed.has(ref)))];
  if (!valid.length) return unsupported;
  const clean = text.trim().replace(/\s+/g, ' ').replace(/\s*\[(?:E-[A-Za-z0-9-]+)\]/g, '').replace(/[.\s]+$/, '');
  return `${clean} ${valid.map(ref => `[${ref}]`).join(' ')}`;
}

function rowText(row: GroundedEvidenceRow): string {
  return `${row.fact_label}: ${row.fact_text}`;
}

function questionEvidence(question: string, evidence: GroundedEvidenceRow[]): GroundedEvidenceRow[] {
  const words = (question.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(word => !questionStopWords.has(word));
  const ranked = evidence.map((row, index) => {
    const haystack = `${row.fact_label} ${row.fact_text} ${row.source_quote || ''} ${row.document_filename || ''}`.toLowerCase();
    const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
    return { row, index, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  return (ranked.length ? ranked.map(item => item.row) : evidence).slice(0, 6);
}

function missingRefs(item: GroundedMissingRow, evidence: GroundedEvidenceRow[]): string[] {
  const ids = new Set(item.basis_evidence_ids || []);
  return evidence.filter(row => row.id && ids.has(row.id)).map(row => row.evidence_ref);
}

export function buildDeterministicCaseAiResult(mode: GroundedMode, context: GroundedCaseContext): any {
  const evidence = context.evidence;
  const refs = new Set(evidence.map(row => row.evidence_ref));
  const firstRefs = evidence.slice(0, 2).map(row => row.evidence_ref);
  if (!evidence.length) return null;

  if (mode === 'ask') {
    const words = (context.question?.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(word => !questionStopWords.has(word));
    const relevant = questionEvidence(context.question || '', evidence);
    const matched = words.length > 0 && relevant.some(row => {
      return words.some(word => `${row.fact_label} ${row.fact_text} ${row.source_quote || ''}`.toLowerCase().includes(word));
    });
    const answer = matched
      ? relevant.filter(row => {
          return words.some(word => `${row.fact_label} ${row.fact_text} ${row.source_quote || ''}`.toLowerCase().includes(word));
        }).slice(0, 5).map(row => sentence(rowText(row), [row.evidence_ref], refs)).join('\n')
      : `I could not find active evidence that answers this question. These are the closest records in the case file:\n${relevant.slice(0, 3).map(row => sentence(rowText(row), [row.evidence_ref], refs)).join('\n')}`;
    return { answer };
  }

  if (mode === 'hearing_brief') {
    const highConfidence = evidence.filter(row => row.confidence != null && row.confidence >= 0.8);
    const lowerConfidence = evidence.filter(row => row.confidence != null && row.confidence < 0.65);
    return {
      case_summary: sentence(`The case file for ${context.case?.case_ref || 'this matter'} contains ${evidence.length} active evidence record${evidence.length === 1 ? '' : 's'}.`, firstRefs, refs),
      important_facts: evidence.slice(0, 10).map(row => sentence(rowText(row), [row.evidence_ref], refs)),
      strong_evidence: (highConfidence.length ? highConfidence : evidence.slice(0, 5)).map(row => sentence(`${row.fact_label} appears in ${row.document_filename || 'the case record'}${row.page_no ? `, page ${row.page_no}` : ''}.`, [row.evidence_ref], refs)),
      weak_evidence: lowerConfidence.map(row => sentence(`${row.fact_label} has a lower extraction confidence and should be checked against its source document.`, [row.evidence_ref], refs)),
      conflicts: context.conflicts.map(item => sentence(`The case record identifies a conflict: ${item.description}`, [item.evidence_a_ref || '', item.evidence_b_ref || ''], refs)),
      missing_documents: context.missing.map(item => sentence(`${item.required_item}${item.rationale ? `: ${item.rationale}` : ' is listed as an open evidence gap'}.`, missingRefs(item, evidence), refs)),
      witness_suggestions: evidence.filter(row => row.entity && /person|witness|signatory|author/i.test(`${row.evidence_type || ''} ${row.fact_label}`)).slice(0, 5).map(row => sentence(`${row.entity} is identified in ${row.fact_label}; counsel can confirm their role and availability.`, [row.evidence_ref], refs)),
      questions_for_client: context.conflicts.map(item => sentence(`Can you clarify the discrepancy recorded as ${item.conflict_ref}?`, [item.evidence_a_ref || '', item.evidence_b_ref || ''], refs)),
      questions_for_opposing_counsel: context.conflicts.map(item => sentence(`Which source record supports the different accounts in ${item.conflict_ref}?`, [item.evidence_a_ref || '', item.evidence_b_ref || ''], refs)),
      timeline: context.timeline.slice(0, 10).map(row => sentence(`${row.date_value || row.date_raw || 'Date not normalized'} — ${rowText(row)}`, [row.evidence_ref], refs))
    };
  }

  if (mode === 'counter_argument') {
    const conflictArguments = context.conflicts.map(item => sentence(`A reviewer may question which account is supported because the record identifies this discrepancy: ${item.description}`, [item.evidence_a_ref || '', item.evidence_b_ref || ''], refs));
    const evidenceLimitations = evidence.filter(row => row.confidence != null && row.confidence < 0.65).map(row => sentence(`${row.fact_label} has a lower extraction confidence; confirm it against the cited original before relying on it.`, [row.evidence_ref], refs));
    const gapArguments = context.missing.map(item => sentence(`The file lists ${item.required_item} as an open evidence gap${item.rationale ? ` (${item.rationale})` : ''}.`, missingRefs(item, evidence), refs));
    const supportedFact = evidence.slice(0, 5).map(row => sentence(`The record also contains this evidence relevant to the opposing position: ${rowText(row)}`, [row.evidence_ref], refs));
    return {
      possible_defence_arguments: conflictArguments.length ? conflictArguments : supportedFact.slice(0, 5),
      possible_prosecution_arguments: supportedFact.slice(0, 5),
      weaknesses: [...evidenceLimitations, ...gapArguments],
      risks: conflictArguments
    };
  }

  const requests = context.missing.map(item => {
    const basis = missingRefs(item, evidence);
    return { document: item.required_item, reason: sentence(item.rationale || `This item is listed as an open evidence gap (${item.missing_ref || 'case record'}).`, basis, refs) };
  });
  const citedRefs = requests.flatMap(item => [...item.reason.matchAll(/\[(E-[A-Za-z0-9-]+)\]/g)].map(match => match[1]));
  const letter = requests.length
    ? `Dear Counsel,\n\nTo complete the documentary record, please provide the following items listed as open evidence gaps: ${requests.map(item => `${item.document} ${item.reason}`).join(' ')}\n\nThis draft is for lawyer review and approval before sending. ${sentence('The request is based on the cited active case records.', citedRefs, refs)}`
    : `Dear Counsel,\n\nNo open document requests are currently recorded for this case. ${sentence('The active case file contains the evidence records listed below.', firstRefs, refs)}\n\nThis draft is for lawyer review and approval before sending.`;
  const email = requests.length
    ? `Subject: Documents requested for ${context.case?.case_ref || 'your matter'}\n\nPlease provide: ${requests.map(item => `${item.document} — ${item.reason}`).join(' ')}\n\nThis draft requires lawyer approval before sending. ${sentence('The request is based on the cited active case records.', citedRefs, refs)}`
    : `Subject: Case documents\n\nNo open document requests are currently recorded. ${sentence('The active case file contains the evidence records listed below.', firstRefs, refs)}`;
  return {
    professional_letter: letter,
    email,
    client_checklist: requests.map(item => ({ document: item.document, reason: item.reason })),
    document_request: requests,
    approvalRequired: true
  };
}

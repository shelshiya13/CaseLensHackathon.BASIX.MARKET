export type EvidenceStrength =
  | 'Verified'
  | 'Contradicted'
  | 'Supported'
  | 'Weak'
  | 'Insufficient Evidence'
  | 'Unverified';

export function getEvidenceStrength(evidence: any, findings: any[] = []): EvidenceStrength {
  if (evidence?.created_by === 'human') return 'Verified';
  if (evidence?.status === 'rejected' || evidence?.status === 'challenged') return 'Contradicted';
  if (evidence?.status === 'corrected') return 'Unverified';

  const finding = findings.find(item => (item.evidence_refs || []).includes(evidence?.evidence_ref));
  if (finding?.status === 'contradicted') return 'Contradicted';
  if (finding?.status === 'insufficient') return 'Insufficient Evidence';
  if (finding?.status === 'unverified') return 'Unverified';
  if (!evidence?.source_quote || !String(evidence.source_quote).trim()) return 'Insufficient Evidence';
  if (evidence?.status !== 'active') return 'Unverified';

  if (evidence.confidence != null && Number(evidence.confidence) < 0.5) return 'Weak';
  if (finding?.status === 'supported') return 'Supported';
  return 'Supported';
}

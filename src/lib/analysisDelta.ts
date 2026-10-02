export type ClaimChange = {
  findingId: string;
  statement: string;
  previousStatus?: string;
  currentStatus: string;
};

export interface AnalysisDelta {
  currentVersion: number;
  previousVersion: number | null;
  newEvidence: any[];
  resolvedEvidence: any[];
  strengthenedClaims: ClaimChange[];
  weakenedClaims: ClaimChange[];
  resolvedMissing: any[];
  newMissing: any[];
  newConflicts: any[];
  resolvedConflicts: any[];
  timelineChanges: any[];
}

function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function snapshot(version: any, field: string): any[] {
  return asArray(version?.[field]);
}

function keyOf(item: any): string {
  return String(item?.ref || item?.evidence_ref || item?.id || '');
}

function statusRank(status: string): number {
  switch (status) {
    case 'supported':
    case 'verified':
      return 3;
    case 'unverified':
    case 'weak':
      return 2;
    case 'contradicted':
    case 'insufficient':
    case 'insufficient_evidence':
    default:
      return 1;
  }
}

function findingsFor(version: any): any[] {
  const reasoning = version?.reasoning && typeof version.reasoning === 'object'
    ? version.reasoning
    : (() => {
      try { return JSON.parse(version?.reasoning_json || '{}'); } catch { return {}; }
    })();
  return Array.isArray(reasoning.findings) ? reasoning.findings : [];
}

function getNewerTimelineEvents(timeline: any, previous: any, current: any): any[] {
  const events = [
    ...(Array.isArray(timeline?.activityEvents) ? timeline.activityEvents : []),
    ...(Array.isArray(timeline?.documentDatedEvents) ? timeline.documentDatedEvents : [])
  ];
  const previousTime = previous?.created_at ? Date.parse(previous.created_at) : Number.NEGATIVE_INFINITY;
  const currentTime = current?.created_at ? Date.parse(current.created_at) : Number.POSITIVE_INFINITY;
  return events.filter(event => {
    const eventTime = Date.parse(event?.occurred_at || event?.created_at || '');
    return Number.isFinite(eventTime) && eventTime > previousTime && eventTime <= currentTime;
  });
}

export function deriveAnalysisDelta(input: {
  versions: any[];
  evidence?: any[];
  timeline?: any;
}): AnalysisDelta | null {
  const versions = input.versions || [];
  const current = versions[0];
  if (!current) return null;
  const previous = versions[1] || null;

  const previousEvidence = previous ? snapshot(previous, 'evidence_snapshot_json') : [];
  const currentEvidence = snapshot(current, 'evidence_snapshot_json');
  const previousEvidenceKeys = new Set(previousEvidence.map(keyOf));
  const currentEvidenceKeys = new Set(currentEvidence.map(keyOf));
  const evidenceByKey = new Map((input.evidence || []).map(item => [keyOf(item), item]));
  const enrichEvidence = (items: any[]) => items.map(item => evidenceByKey.get(keyOf(item)) || item);

  const previousMissing = previous ? snapshot(previous, 'missing_snapshot_json') : [];
  const currentMissing = snapshot(current, 'missing_snapshot_json');
  const previousMissingKeys = new Set(previousMissing.map(keyOf));
  const currentMissingKeys = new Set(currentMissing.map(keyOf));

  const previousConflicts = previous ? snapshot(previous, 'conflict_snapshot_json') : [];
  const currentConflicts = snapshot(current, 'conflict_snapshot_json');
  const previousConflictKeys = new Set(previousConflicts.map(keyOf));
  const currentConflictKeys = new Set(currentConflicts.map(keyOf));

  const previousFindings = new Map(findingsFor(previous).map(finding => [finding.finding_id, finding]));
  const strengthenedClaims: ClaimChange[] = [];
  const weakenedClaims: ClaimChange[] = [];
  for (const finding of findingsFor(current)) {
    const prior = previousFindings.get(finding.finding_id);
    if (!prior) {
      if (statusRank(finding.status) >= statusRank('supported')) {
        strengthenedClaims.push({
          findingId: finding.finding_id,
          statement: finding.statement,
          currentStatus: finding.status
        });
      }
      continue;
    }

    const priorRank = statusRank(prior.status);
    const currentRank = statusRank(finding.status);
    if (currentRank > priorRank) {
      strengthenedClaims.push({
        findingId: finding.finding_id,
        statement: finding.statement,
        previousStatus: prior.status,
        currentStatus: finding.status
      });
    } else if (currentRank < priorRank) {
      weakenedClaims.push({
        findingId: finding.finding_id,
        statement: finding.statement,
        previousStatus: prior.status,
        currentStatus: finding.status
      });
    }
  }

  return {
    currentVersion: Number(current.version_no) || 0,
    previousVersion: previous ? Number(previous.version_no) || 0 : null,
    newEvidence: enrichEvidence(currentEvidence.filter(item => !previousEvidenceKeys.has(keyOf(item)))),
    resolvedEvidence: enrichEvidence(previousEvidence.filter(item => !currentEvidenceKeys.has(keyOf(item)))),
    strengthenedClaims,
    weakenedClaims,
    resolvedMissing: previousMissing.filter(item => !currentMissingKeys.has(keyOf(item))),
    newMissing: currentMissing.filter(item => !previousMissingKeys.has(keyOf(item))),
    newConflicts: currentConflicts.filter(item => !previousConflictKeys.has(keyOf(item))),
    resolvedConflicts: previousConflicts.filter(item => !currentConflictKeys.has(keyOf(item))),
    timelineChanges: getNewerTimelineEvents(input.timeline, previous, current)
  };
}

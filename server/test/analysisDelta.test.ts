import { describe, expect, it } from 'vitest';
import { deriveAnalysisDelta } from '../../src/lib/analysisDelta.js';

describe('analysis delta projection', () => {
  it('compares evidence, finding strength, conflicts, gaps, and timeline between saved versions', () => {
    const previous = {
      version_no: 2,
      created_at: '2026-10-01T10:00:00.000Z',
      evidence_snapshot_json: JSON.stringify([{ id: 'e1', ref: 'E-001', status: 'active' }, { id: 'e2', ref: 'E-002', status: 'active' }]),
      conflict_snapshot_json: JSON.stringify([{ id: 'c1', ref: 'C-001', status: 'open' }]),
      missing_snapshot_json: JSON.stringify([{ id: 'm1', ref: 'M-001', status: 'open' }]),
      reasoning: { findings: [{ finding_id: 'F-1', statement: 'Payment is complete.', status: 'unverified', evidence_refs: ['E-001'] }] }
    };
    const current = {
      version_no: 3,
      created_at: '2026-10-02T10:00:00.000Z',
      evidence_snapshot_json: JSON.stringify([{ id: 'e1', ref: 'E-001', status: 'active' }, { id: 'e3', ref: 'E-003', status: 'active' }]),
      conflict_snapshot_json: JSON.stringify([{ id: 'c2', ref: 'C-002', status: 'open' }]),
      missing_snapshot_json: JSON.stringify([{ id: 'm2', ref: 'M-002', status: 'open' }]),
      reasoning: { findings: [{ finding_id: 'F-1', statement: 'Payment is complete.', status: 'supported', evidence_refs: ['E-001', 'E-003'] }] }
    };

    const delta = deriveAnalysisDelta({
      versions: [current, previous],
      evidence: [{ id: 'e3', evidence_ref: 'E-003', fact_label: 'Bank transfer' }],
      timeline: { activityEvents: [{ id: 't1', occurred_at: '2026-10-02T09:00:00.000Z' }], documentDatedEvents: [] }
    });

    expect(delta).toMatchObject({
      currentVersion: 3,
      previousVersion: 2,
      newEvidence: [{ evidence_ref: 'E-003' }],
      resolvedEvidence: [{ id: 'e2', ref: 'E-002' }],
      strengthenedClaims: [{ findingId: 'F-1', previousStatus: 'unverified', currentStatus: 'supported' }],
      resolvedMissing: [{ id: 'm1', ref: 'M-001' }],
      newMissing: [{ id: 'm2', ref: 'M-002' }],
      newConflicts: [{ id: 'c2', ref: 'C-002' }],
      resolvedConflicts: [{ id: 'c1', ref: 'C-001' }],
      timelineChanges: [{ id: 't1' }]
    });
  });

  it('returns null when there is no saved analysis version', () => {
    expect(deriveAnalysisDelta({ versions: [] })).toBeNull();
  });
});

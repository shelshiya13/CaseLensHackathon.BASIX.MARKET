import { describe, expect, it } from 'vitest';
import { getEvidenceStrength } from '../../src/lib/evidenceStrength.js';

describe('deterministic evidence strength', () => {
  it('uses human correction, finding status, grounding, and recorded confidence only', () => {
    expect(getEvidenceStrength({ created_by: 'human', status: 'active' })).toBe('Verified');
    expect(getEvidenceStrength({ evidence_ref: 'E-1', status: 'active', source_quote: 'quoted text' }, [
      { evidence_refs: ['E-1'], status: 'contradicted' }
    ])).toBe('Contradicted');
    expect(getEvidenceStrength({ evidence_ref: 'E-2', status: 'active', source_quote: 'quoted text' }, [
      { evidence_refs: ['E-2'], status: 'supported' }
    ])).toBe('Supported');
    expect(getEvidenceStrength({ evidence_ref: 'E-3', status: 'active', source_quote: 'quoted text', confidence: 0.4 })).toBe('Weak');
    expect(getEvidenceStrength({ evidence_ref: 'E-4', status: 'active', source_quote: '' })).toBe('Insufficient Evidence');
    expect(getEvidenceStrength({ evidence_ref: 'E-5', status: 'corrected', source_quote: 'quoted text' })).toBe('Unverified');
  });
});

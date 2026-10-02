import { describe, expect, it } from 'vitest';
import { createCitedStatement, filterGroundedEvidenceRefs } from '../src/agents/caseAgents.js';

describe('case-agent citation grounding', () => {
  it('keeps only exact references from the active evidence set', () => {
    expect(filterGroundedEvidenceRefs(['E-1', 'E-99', 'C-1', 'E-1'], ['E-1', 'E-2'])).toEqual(['E-1']);
  });

  it('adds an active E-reference and removes forged inline references', () => {
    const statement = createCitedStatement('The record confirms delivery [E-99].', ['E-2'], ['E-1', 'E-2']);
    expect(statement.evidenceRefs).toEqual(['E-2']);
    expect(statement.text).toContain('[E-2]');
    expect(statement.text).not.toContain('[E-99]');
  });

  it('returns the required insufficient-evidence fallback when no citation is valid', () => {
    expect(createCitedStatement('Unsupported assertion', ['E-7'], ['E-1'])).toEqual({
      text: 'Unable to establish this from available evidence.',
      evidenceRefs: []
    });
  });
});

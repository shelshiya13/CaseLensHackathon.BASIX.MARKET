import { describe, expect, it } from 'vitest';
import { REQUIRED_AGENT_NAMES, runMultiAgentPipeline } from '../src/agents/agentRuntime.js';

describe('multi-agent runtime', () => {
  it('defines every required agent and emits structured outputs with citation metadata', async () => {
    const results = await runMultiAgentPipeline({
      caseId: 'case-123',
      documentId: 'doc-123',
      evidence: [
        {
          ref: 'E-001',
          fact: 'Payment is due within 30 days.',
          sourceQuote: 'Payment is due within 30 days.',
          pageNo: 1,
          type: 'payment'
        }
      ],
      conflicts: [],
      missingEvidence: []
    });

    expect(results.map(item => item.agent)).toEqual(expect.arrayContaining([...REQUIRED_AGENT_NAMES]));

    for (const item of results) {
      expect(item).toMatchObject({
        agent: expect.any(String),
        status: expect.any(String),
        confidence: expect.any(Number),
        citations: expect.any(Array),
        sourceQuotes: expect.any(Array),
        pageReferences: expect.any(Array),
        diagnostics: expect.any(Object),
        payload: expect.any(Object)
      });
      expect(item.confidence).toBeGreaterThanOrEqual(0);
      expect(item.confidence).toBeLessThanOrEqual(1);
      expect(item.citations.length >= 0).toBe(true);
      expect(item.sourceQuotes.length >= 0).toBe(true);
      expect(item.pageReferences.length >= 0).toBe(true);
    }
  });
});

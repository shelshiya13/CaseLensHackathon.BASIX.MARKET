import { describe, expect, it } from 'vitest';
import {
  disableGeminiForAuthenticationError,
  getGeminiClient,
  isGeminiAuthenticationRejected
} from '../src/agents/geminiClient.js';

describe('Gemini authentication fallback circuit', () => {
  it('keeps transient errors retryable but disables an authentication-rejected client', () => {
    expect(isGeminiAuthenticationRejected()).toBe(false);
    expect(disableGeminiForAuthenticationError(Object.assign(new Error('temporarily unavailable'), { status: 503 }))).toBe(false);
    expect(isGeminiAuthenticationRejected()).toBe(false);

    const invalidCredential = Object.assign(new Error('authentication rejected'), { status: 401 });
    expect(disableGeminiForAuthenticationError(invalidCredential)).toBe(true);
    expect(isGeminiAuthenticationRejected()).toBe(true);
    expect(getGeminiClient()).toBeNull();
  });
});

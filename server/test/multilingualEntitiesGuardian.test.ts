import { describe, expect, it, vi } from 'vitest';
import { detectLanguage, SUPPORTED_LANGUAGES } from '../src/i18n/languages.js';
import { deterministicEnglishFallback } from '../src/i18n/translateService.js';
import { groupEntityAliases, normalizeEntityName, pickCanonicalName } from '../src/entities/entityService.js';
import { sanitizeApprovalText } from '../src/guardian/guardianSummaryService.js';

vi.mock('../src/agents/geminiClient.js', () => ({ getGeminiClient: () => null, disableGeminiForAuthenticationError: () => false }));

describe('multilingual support', () => {
  it('supports en ta hi te kn ml mr bn', () => {
    expect(SUPPORTED_LANGUAGES.map(l => l.code).sort()).toEqual(['bn', 'en', 'hi', 'kn', 'ml', 'mr', 'ta', 'te']);
  });
  it('detects scripts deterministically', () => {
    expect(detectLanguage('Hello contract')).toBe('en');
    expect(detectLanguage('ஒப்பந்தம் வழக்கு')).toBe('ta');
    expect(detectLanguage('अनुबंध न्यायालय')).toBe('hi');
    expect(detectLanguage('करार आणि न्यायालय आहे')).toBe('mr');
    expect(detectLanguage('ఒప్పందం కేసు')).toBe('te');
    expect(detectLanguage('ಒಪ್ಪಂದ ಪ್ರಕರಣ')).toBe('kn');
    expect(detectLanguage('കരാർ കേസ്')).toBe('ml');
    expect(detectLanguage('চুক্তি মামলা')).toBe('bn');
    expect(detectLanguage('करार आहे')).toBe('mr');
  });
  it('falls back without inventing translations', () => {
    const r = deterministicEnglishFallback('ஒப்பந்தம்', 'ta');
    expect(r.provider).toBe('deterministic_fallback');
    expect(r.englishText).toContain('ஒப்பந்தம்');
    expect(deterministicEnglishFallback('plain', 'en').englishText).toBe('plain');
  });
});

describe('entity resolution', () => {
  it('merges FTPL variants deterministically', () => {
    const groups = groupEntityAliases(['FTPL', 'Fictional Traders Pvt Ltd', 'M/s Fictional Traders', 'ABC Ltd', 'ABC Limited', 'ABC Holdings', 'Unrelated Co']);
    const ftpl = groups.find(g => g.includes('FTPL'));
    expect(ftpl).toBeDefined();
    expect(ftpl).toContain('Fictional Traders Pvt Ltd');
    expect(ftpl).toContain('M/s Fictional Traders');
    const abc = groups.find(g => g.includes('ABC Ltd'));
    expect(abc).toContain('ABC Limited');
    expect(pickCanonicalName(['FTPL', 'Fictional Traders Pvt Ltd'])).toBe('Fictional Traders Pvt Ltd');
    expect(normalizeEntityName('M/s Fictional Traders')).toBe('fictional traders');
    expect(groups.find(g => g.includes('ABC Ltd'))).not.toContain('ABC Holdings');
  });
});

describe('guardian summary safety', () => {
  it('rejects confidential notes', () => {
    expect(() => sanitizeApprovalText('contains internal note details')).toThrow();
    expect(() => sanitizeApprovalText('')).toThrow();
    expect(sanitizeApprovalText('Hearing on 12 August.')).toContain('Hearing');
  });
});

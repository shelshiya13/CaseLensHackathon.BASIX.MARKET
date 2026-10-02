import { Type } from '@google/genai';
import { getGeminiClient, disableGeminiForAuthenticationError } from '../agents/geminiClient.js';
import { env } from '../config/env.js';
import { detectLanguage, isSupportedLanguage, type SupportedLanguageCode } from './languages.js';

export interface TranslationResult {
  sourceLanguage: SupportedLanguageCode;
  englishText: string;
  provider: 'gemini' | 'deterministic_fallback';
  confidence: number;
}

// Deterministic fallback: never invents a translation. Preserves the original
// text verbatim and prefixes a language-tagged header so the UI can always show
// original + English translation + highlighted quote without hallucination.
export function deterministicEnglishFallback(text: string, sourceLanguage: SupportedLanguageCode): TranslationResult {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { sourceLanguage, englishText: '', provider: 'deterministic_fallback', confidence: 0 };
  }
  if (sourceLanguage === 'en') {
    return { sourceLanguage, englishText: trimmed, provider: 'deterministic_fallback', confidence: 1 };
  }
  return {
    sourceLanguage,
    englishText: `[${sourceLanguage} original preserved — English translation pending Gemini configuration]\n${trimmed}`,
    provider: 'deterministic_fallback',
    confidence: 0.35,
  };
}

export async function translateToEnglish(
  text: string,
  hintedLanguage?: string
): Promise<TranslationResult> {
  const sourceLanguage: SupportedLanguageCode =
    (hintedLanguage && isSupportedLanguage(hintedLanguage) ? hintedLanguage : detectLanguage(text));
  const trimmed = (text || '').trim();
  if (!trimmed) return { sourceLanguage, englishText: '', provider: 'deterministic_fallback', confidence: 0 };

  const ai = getGeminiClient();
  if (!ai) return deterministicEnglishFallback(trimmed, sourceLanguage);
  if (sourceLanguage === 'en') {
    return { sourceLanguage, englishText: trimmed, provider: 'deterministic_fallback', confidence: 1 };
  }

  try {
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: [{
          text: `Translate the following legal document text from language "${sourceLanguage}" to plain English. Preserve dates, amounts, names, and clause meaning exactly. Return JSON only.\n\nTEXT:\n"""\n${trimmed.slice(0, 8000)}\n"""`,
        }],
      }],
      config: {
        systemInstruction: 'You are a legal translator. Translate faithfully to English. Do not add facts. Return JSON only.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: { englishText: { type: Type.STRING } },
          required: ['englishText'],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}') as { englishText?: string };
    const englishText = typeof parsed.englishText === 'string' ? parsed.englishText.trim() : '';
    if (!englishText) return deterministicEnglishFallback(trimmed, sourceLanguage);
    return { sourceLanguage, englishText: englishText.slice(0, 12000), provider: 'gemini', confidence: 0.9 };
  } catch (error) {
    disableGeminiForAuthenticationError(error);
    return deterministicEnglishFallback(trimmed, sourceLanguage);
  }
}

export function buildEvidenceHighlight(originalText: string, quote: string): { before: string; match: string; after: string } {
  if (!originalText) return { before: '', match: '', after: '' };
  if (!quote || quote.length < 5) return { before: originalText, match: '', after: '' };
  const idx = originalText.toLowerCase().indexOf(quote.toLowerCase());
  if (idx === -1) return { before: originalText, match: '', after: '' };
  return {
    before: originalText.slice(0, idx),
    match: originalText.slice(idx, idx + quote.length),
    after: originalText.slice(idx + quote.length),
  };
}

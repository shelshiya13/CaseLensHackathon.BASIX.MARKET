import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

let genAiInstance: GoogleGenAI | null = null;
let authenticationRejected = false;

export function disableGeminiForAuthenticationError(error: unknown): boolean {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : 0;
  const details = error instanceof Error ? error.message : String(error);
  if (status !== 401 && status !== 403 && !/ACCESS_TOKEN_TYPE_UNSUPPORTED|UNAUTHENTICATED|API_KEY_INVALID|API key not valid|invalid API key|PERMISSION_DENIED/i.test(details)) {
    return false;
  }

  authenticationRejected = true;
  genAiInstance = null;
  console.warn('[Gemini] Authentication rejected; deterministic fallback is active for this process.');
  return true;
}

export function isGeminiAuthenticationRejected(): boolean {
  return authenticationRejected;
}

export function getGeminiApiKey(): string | null {
  const candidate =
    (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()) ||
    (env.GOOGLE_API_KEY && env.GOOGLE_API_KEY.trim()) ||
    (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) ||
    (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim()) ||
    null;

  if (!candidate || candidate === 'your_gemini_api_key_here' || candidate.length === 0) {
    return null;
  }
  return candidate;
}

export function getGeminiClient(): GoogleGenAI | null {
  if (authenticationRejected) return null;
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  if (!genAiInstance) {
    genAiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
        timeout: 30000
      }
    });
  }
  return genAiInstance;
}

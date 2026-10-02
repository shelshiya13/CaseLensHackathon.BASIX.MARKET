import crypto from 'crypto';
import { getGeminiClient, disableGeminiForAuthenticationError } from '../agents/geminiClient.js';
import { env } from '../config/env.js';
import { getDb } from '../db/client.js';

// Guardian summaries must NEVER include confidential notes, AI reasoning traces,
// conflicts, missing-evidence internals, or unshared docs. Only the lawyer's
// explicit approval text is used as the source.
const CONFIDENTIAL_PATTERNS = [
  /internal note/i, /confidential/i, /work product/i, /strategy/i,
  /conflict/i, /missing evidence/i, /reasoning trace/i, /chain.of.thought/i,
];

export function sanitizeApprovalText(approvalText: string): string {
  const text = (approvalText || '').trim();
  if (!text) throw new Error('Approval text is required.');
  for (const pattern of CONFIDENTIAL_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error('Approval text must not contain confidential notes, conflicts, or internal reasoning. Provide a guardian-safe summary only.');
    }
  }
  return text.slice(0, 4000);
}

function deterministicGuardianVariants(plainEnglish: string): { tamil: string; hindi: string } {
  // Deterministic fallback preserves meaning without inventing translation:
  // labels the original as source and keeps it verbatim so guardians always
  // see accurate content even without Gemini.
  return {
    tamil: `[தமிழ் விளக்கம் — Gemini இணைக்கப்படவில்லை]\n${plainEnglish}`,
    hindi: `[हिंदी सारांश — Gemini उपलब्ध नहीं है]\n${plainEnglish}`,
  };
}

function toPlainEnglish(approvalText: string): string {
  const sentences = approvalText.split(/(?<=[.!?])\s+/).filter(Boolean);
  const plain = sentences.map(s => s.trim()).join(' ');
  return `Hello — here is a simple update about your matter. ${plain} Your lawyer has reviewed this update. If you have questions, please contact your lawyer.`;
}

export async function createGuardianSummary(caseId: string, approvalText: string, approvedBy: string) {
  const safeApproval = sanitizeApprovalText(approvalText);
  const plainEnglish = toPlainEnglish(safeApproval);
  let tamil = '';
  let hindi = '';
  let provider: 'gemini' | 'deterministic_fallback' = 'deterministic_fallback';

  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: [{
          role: 'user',
          parts: [{ text: `Rewrite this lawyer-approved case update into (1) plain guardian-friendly English, (2) Tamil, (3) Hindi. Use simple non-legal language. Never add confidential details. Return JSON {"plainEnglish":..., "tamil":..., "hindi":...}.\n\nAPPROVED UPDATE:\n"""\n${safeApproval}\n"""` }],
        }],
        config: {
          systemInstruction: 'You write guardian-friendly legal updates in plain English, Tamil, and Hindi. Never expose confidential notes. Return JSON only.',
          responseMimeType: 'application/json',
        },
      });
      const parsed = JSON.parse(response.text || '{}') as { plainEnglish?: string; tamil?: string; hindi?: string };
      if (parsed.plainEnglish && parsed.tamil && parsed.hindi) {
        provider = 'gemini';
        const db0 = await getDb();
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        db0.prepare('INSERT INTO guardian_summaries (id, case_id, approval_text, plain_english, tamil_text, hindi_text, provider, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, caseId, safeApproval, parsed.plainEnglish.slice(0, 4000), parsed.tamil.slice(0, 4000), parsed.hindi.slice(0, 4000), provider, approvedBy, now);
        return {
          id, caseId, approvalText: safeApproval,
          plainEnglish: parsed.plainEnglish.slice(0, 4000),
          tamil: parsed.tamil.slice(0, 4000),
          hindi: parsed.hindi.slice(0, 4000),
          provider, createdAt: now,
        };
      }
    } catch (error) {
      disableGeminiForAuthenticationError(error);
    }
  }

  const fallback = deterministicGuardianVariants(plainEnglish);
  tamil = fallback.tamil;
  hindi = fallback.hindi;
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO guardian_summaries (id, case_id, approval_text, plain_english, tamil_text, hindi_text, provider, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, caseId, safeApproval, plainEnglish, tamil, hindi, provider, approvedBy, now);
  return { id, caseId, approvalText: safeApproval, plainEnglish, tamil, hindi, provider, createdAt: now };
}

export async function listGuardianSummaries(caseId: string) {
  const db = await getDb();
  return db.prepare<any>('SELECT id, case_id, approval_text, plain_english, tamil_text, hindi_text, provider, approved_by, created_at FROM guardian_summaries WHERE case_id = ? ORDER BY created_at DESC').all(caseId);
}

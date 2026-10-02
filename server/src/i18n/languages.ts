export type SupportedLanguageCode =
  | 'en' | 'ta' | 'hi' | 'te' | 'kn' | 'ml' | 'mr' | 'bn';

export interface SupportedLanguage {
  code: SupportedLanguageCode;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
];

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map(l => l.code);

export function isSupportedLanguage(code: string): code is SupportedLanguageCode {
  return (SUPPORTED_LANGUAGE_CODES as string[]).includes(code);
}

// Deterministic script-range detection (no network, no model).
// Returns 'en' when no non-Latin script is dominant.
export function detectLanguage(text: string): SupportedLanguageCode {
  if (!text || !text.trim()) return 'en';
  const counts: Record<string, number> = { ta: 0, hi: 0, te: 0, kn: 0, ml: 0, bn: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 0;
    if (cp >= 0x0b80 && cp <= 0x0bff) counts.ta++;
    else if (cp >= 0x0900 && cp <= 0x097f) counts.hi++;
    else if (cp >= 0x0c00 && cp <= 0x0c7f) counts.te++;
    else if (cp >= 0x0c80 && cp <= 0x0cff) counts.kn++;
    else if (cp >= 0x0d00 && cp <= 0x0d7f) counts.ml++;
    else if (cp >= 0x0980 && cp <= 0x09ff) counts.bn++;
  }
  // Devanagari is shared by Hindi + Marathi. Use Marathi-distinctive
  // function words only (generic legal nouns like करार/न्यायालय occur in Hindi too).
  const lower = text.toLowerCase();
  const marathiCues = ['आहे', 'नाही', 'आणि', 'मध्ये', 'म्हणून', 'होते'];
  const hasMarathiCue = marathiCues.some(cue => text.includes(cue));
  let best: SupportedLanguageCode = 'en';
  let bestCount = 0;
  for (const [code, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      best = code as SupportedLanguageCode;
    }
  }
  if (bestCount === 0) return 'en';
  if ((best === 'hi') && hasMarathiCue) return 'mr';
  // Bengali vs others already separated by range; Hindi default for Devanagari.
  if (best === 'bn') return lower.includes('বাংলা') || bestCount > 0 ? 'bn' : best;
  return best;
}

export function languageLabel(code: string): string {
  const found = SUPPORTED_LANGUAGES.find(l => l.code === code);
  return found ? `${found.label} (${found.nativeLabel})` : code;
}

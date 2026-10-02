import crypto from 'crypto';
import { getGeminiClient, disableGeminiForAuthenticationError } from '../agents/geminiClient.js';
import { env } from '../config/env.js';

export interface EntityClusterView {
  id: string;
  caseId: string;
  canonicalName: string;
  status: string;
  aliases: string[];
}

// --- Deterministic normalization (fallback when Gemini unavailable) ---
const SUFFIX_PATTERNS: Array<[RegExp, string]> = [
  [/\b(pvt|private)\.?\s+ltd\.?$/i, ''],
  [/\b(ltd|limited)\.?$/i, ''],
  [/\bm\/s\.?\s+/i, ''],
  [/\b(messrs|shri|smt|mr|mrs|ms)\.?\s+/i, ''],
  [/[.,\s]+$/g, ''],
];

export function normalizeEntityName(raw: string): string {
  let name = (raw || '').trim().replace(/\s+/g, ' ');
  if (!name) return '';
  for (const [pattern] of SUFFIX_PATTERNS) {
    name = name.replace(pattern, '').trim();
  }
  name = name.replace(/\b(pvt|ltd|limited|private|traders|trading)\b/gi, m => m.toLowerCase()).trim();
  // Canonical key: lowercase, strip punctuation/org suffixes for grouping.
  const key = name
    .toLowerCase()
    .replace(/\b(m\/s|messrs|pvt|private|ltd|limited|inc|llc|corp|company|co)\b\.?/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return key;
}

function abbreviationOf(key: string): string {
  return key.split(' ').filter(Boolean).map(w => w[0]).join('');
}

function stripHonorifics(raw: string): string {
  return (raw || '')
    .replace(/^\s*m\s*\/\s*s\.?\s+/i, '')
    .replace(/^\s*(messrs|shri|smt|mr|mrs|ms)\.?\s+/i, '')
    .trim();
}

function fullInitials(raw: string): string {
  // Keep ALL words (including Pvt/Ltd) so acronyms like FTPL match
  // "Fictional Traders Pvt Ltd" -> "ftpl".
  const base = stripHonorifics(raw);
  return base.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean).map(w => w[0]).join('');
}

function initialsMatch(abbr: string, initials: string): boolean {
  if (!abbr || !initials || abbr.length < 2) return false;
  return abbr === initials || abbr.startsWith(initials) || initials.startsWith(abbr);
}

function contentTokens(raw: string): string[] {
  const stop = new Set(['m', 's', 'messrs', 'shri', 'smt', 'mr', 'mrs', 'ms', 'pvt', 'private', 'ltd', 'limited', 'inc', 'llc', 'corp', 'company', 'co', 'the', 'of']);
  return stripHonorifics(raw).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w && !stop.has(w));
}

function contentOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setB = new Set(b);
  const shared = a.filter(t => setB.has(t));
  if (shared.length === 0) return false;
  // Share every token of the shorter name ("fictional traders" ⊂ "fictional traders pvt ltd").
  const shorter = Math.min(a.length, b.length);
  // A single common token (for example "ABC" in "ABC" and "ABC Holdings")
  // is not enough to identify a legal entity. Exact normalized names and
  // verified initialisms are handled separately below.
  if (shorter === 1) return a.length === b.length && shared.length === 1;
  return shared.length >= shorter;
}

export function groupEntityAliases(names: string[]): string[][] {
  const cleaned = [...new Set(names.map(n => (n || '').trim()).filter(n => n.length >= 2))];
  const groups: string[][] = [];
  const assigned = new Set<number>();
  for (let i = 0; i < cleaned.length; i++) {
    if (assigned.has(i)) continue;
    const keyA = normalizeEntityName(cleaned[i]);
    const abbrA = abbreviationOf(keyA);
    const group = [cleaned[i]];
    assigned.add(i);
    for (let j = i + 1; j < cleaned.length; j++) {
      if (assigned.has(j)) continue;
      const keyB = normalizeEntityName(cleaned[j]);
      const abbrB = abbreviationOf(keyB);
      const initialsA = fullInitials(cleaned[i]);
      const initialsB = fullInitials(cleaned[j]);
      const tokensA = contentTokens(cleaned[i]);
      const tokensB = contentTokens(cleaned[j]);
      const lettersA = stripHonorifics(cleaned[i]).replace(/[^a-zA-Z]/g, '').toLowerCase();
      const lettersB = stripHonorifics(cleaned[j]).replace(/[^a-zA-Z]/g, '').toLowerCase();
      const singleWordA = !stripHonorifics(cleaned[i]).trim().includes(' ');
      const singleWordB = !stripHonorifics(cleaned[j]).trim().includes(' ');
      const isAbbrA = singleWordA && lettersA.length >= 2 && lettersA.length <= 5;
      const isAbbrB = singleWordB && lettersB.length >= 2 && lettersB.length <= 5;
      const match =
        keyA === keyB ||
        contentOverlap(tokensA, tokensB) ||
        (abbrA.length >= 2 && (abbrA === keyB.replace(/\s/g, '') || abbrA === abbrB)) ||
        (abbrB.length >= 2 && abbrB === keyA.replace(/\s/g, '')) ||
        (isAbbrA && initialsMatch(lettersA, initialsB)) ||
        (isAbbrB && initialsMatch(lettersB, initialsA)) ||
        (isAbbrA && isAbbrB && lettersA === lettersB);
      if (match) {
        group.push(cleaned[j]);
        assigned.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

export function pickCanonicalName(aliases: string[]): string {
  if (aliases.length === 0) return '';
  // Prefer the longest descriptive name (e.g. "Fictional Traders Pvt Ltd" over "FTPL").
  return [...aliases].sort((a, b) => b.length - a.length)[0];
}

// Gemini-assisted clustering when available; deterministic fallback otherwise.
export async function suggestClusters(names: string[]): Promise<string[][]> {
  const deterministic = groupEntityAliases(names);
  const ai = getGeminiClient();
  if (!ai || names.length <= 1) return deterministic;
  try {
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: [{ text: `Group these legal entity mentions that refer to the same party. Return JSON {"groups":[["a","b"]]}. Names: ${JSON.stringify(names.slice(0, 40))}` }],
      }],
      config: {
        systemInstruction: 'You resolve legal entity aliases. Only group names that clearly refer to the same party. Return JSON only.',
        responseMimeType: 'application/json',
      },
    });
    const parsed = JSON.parse(response.text || '{}') as { groups?: string[][] };
    if (Array.isArray(parsed.groups) && parsed.groups.length > 0) {
      const known = new Set(names);
      const valid = parsed.groups
        .map(g => (Array.isArray(g) ? g.filter(n => typeof n === 'string' && known.has(n)) : []))
        .filter(g => g.length > 0);
      if (valid.length > 0) return valid;
    }
    return deterministic;
  } catch (error) {
    disableGeminiForAuthenticationError(error);
    return deterministic;
  }
}

export async function persistSuggestedClusters(caseId: string, names: string[]): Promise<EntityClusterView[]> {
  const { getDb } = await import('../db/client.js');
  const db = await getDb();
  const groups = await suggestClusters(names);
  const now = new Date().toISOString();
  const views: EntityClusterView[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    const existingAliases = db.prepare<any>(
      'SELECT cluster_id FROM entity_aliases WHERE case_id = ? AND alias IN (' + group.map(() => '?').join(',') + ')'
    ).all(caseId, ...group);
    if (existingAliases.length > 0) continue;
    const canonical = pickCanonicalName(group);
    const clusterId = crypto.randomUUID();
    db.prepare('INSERT INTO entity_clusters (id, case_id, canonical_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(clusterId, caseId, canonical, 'suggested', now, now);
    for (const alias of group) {
      db.prepare('INSERT INTO entity_aliases (id, cluster_id, case_id, alias, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), clusterId, caseId, alias, 'deterministic', now);
    }
    views.push({ id: clusterId, caseId, canonicalName: canonical, status: 'suggested', aliases: group });
  }
  return views;
}

export async function listEntityClusters(caseId: string): Promise<EntityClusterView[]> {
  const { getDb } = await import('../db/client.js');
  const db = await getDb();
  const clusters = db.prepare<any>('SELECT * FROM entity_clusters WHERE case_id = ? ORDER BY created_at ASC').all(caseId);
  return clusters.map(c => ({
    id: c.id,
    caseId: c.case_id,
    canonicalName: c.canonical_name,
    status: c.status,
    aliases: db.prepare<any>('SELECT alias FROM entity_aliases WHERE cluster_id = ? ORDER BY alias ASC').all(c.id).map(a => a.alias),
  }));
}

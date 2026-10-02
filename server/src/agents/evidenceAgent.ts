import { Type } from '@google/genai';
import { disableGeminiForAuthenticationError, getGeminiClient } from './geminiClient.js';
import { EVIDENCE_EXTRACTION_SYSTEM_INSTRUCTION } from './prompts/evidence.js';
import { logPipelineStage } from './pipelineLog.js';
import { env } from '../config/env.js';

export interface ExtractedEvidenceItem {
  evidenceType: string;
  factLabel: string;
  factText: string;
  entity?: string | null;
  dateValue?: string | null;
  dateRaw?: string | null;
  amountValue?: number | null;
  currency?: string | null;
  amountRaw?: string | null;
  sourceQuote: string;
  pageNo: number;
  confidence: number | null;
  confidenceBasis: Record<string, any>;
  validationNotes?: string | null;
}

export interface ExtractedClaimItem {
  claimText: string;
  claimKind: 'payment_completed' | 'delivery_completed' | 'contract_exists' | 'amount_owed' | 'other';
  sourceQuote: string;
  pageNo: number;
}

export interface EvidenceExtractionResult {
  evidence: ExtractedEvidenceItem[];
  claims: ExtractedClaimItem[];
  rejectionCount: number;
}

export interface EvidenceExtractionContext {
  filename?: string;
  documentId?: string;
  caseId?: string;
}

export function parseIndianAmount(rawStr: string): { value: number | null; currency: string | null } {
  if (!rawStr) return { value: null, currency: null };
  const cleaned = rawStr.replace(/[,\s]/g, '');

  let currency = 'INR';
  if (rawStr.includes('$')) currency = 'USD';
  else if (rawStr.includes('€')) currency = 'EUR';
  else if (rawStr.includes('£')) currency = 'GBP';
  else if (rawStr.includes('₹') || rawStr.includes('¹') || rawStr.toLowerCase().includes('rs') || rawStr.toLowerCase().includes('inr')) currency = 'INR';

  // Match numbers with possible decimals
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return { value: null, currency };

  const num = parseFloat(match[1]);
  // convert to minor units (paisa/cents)
  return { value: Math.round(num * 100), currency };
}

export function parseLegalDate(rawStr: string): string | null {
  if (!rawStr) return null;
  const trimmed = rawStr.trim();

  // Try standard ISO
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isValidCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? trimmed : null;

  const monthNumbers: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  const natural = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  const naturalReverse = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  const naturalParts = natural
    ? { day: Number(natural[1]), month: monthNumbers[natural[2].slice(0, 3).toLowerCase()], year: Number(natural[3]) }
    : naturalReverse
    ? { day: Number(naturalReverse[2]), month: monthNumbers[naturalReverse[1].slice(0, 3).toLowerCase()], year: Number(naturalReverse[3]) }
    : null;
  if (naturalParts) return formatCalendarDate(naturalParts.year, naturalParts.month, naturalParts.day);

  // Common Indian/UK format: DD/MM/YYYY
  const parts = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (parts) {
    return formatCalendarDate(Number(parts[3]), Number(parts[2]), Number(parts[1]));
  }

  return null;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatCalendarDate(year: number, month: number, day: number): string | null {
  if (!month || !isValidCalendarDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function verifyQuoteGrounding(pageText: string, quote: string): boolean {
  return quote.length > 0 && pageText.includes(quote);
}

export async function extractEvidenceFromDocument(
  pages: Array<{ pageNo: number; text: string; method: string }>,
  context: EvidenceExtractionContext = {}
): Promise<EvidenceExtractionResult> {
  const allEvidence: ExtractedEvidenceItem[] = [];
  const allClaims: ExtractedClaimItem[] = [];
  let rejectionCount = 0;

  for (const page of pages) {
    const pageStartedAt = Date.now();
    const pageText = page.text.trim();
    if (!pageText || pageText.length < 15) continue;
    const ai = getGeminiClient();

    const logStage = (stage: string, parser: string, startedAt: number, evidenceCount: number, claimCount: number, details: Record<string, unknown> = {}) => {
      logPipelineStage(stage, {
        filename: context.filename || '',
        documentId: context.documentId || '',
        caseId: context.caseId || '',
        parser,
        extractedCharacters: pageText.length,
        evidenceCount,
        conflictCount: 0,
        missingEvidenceCount: 0,
        startedAt,
        preview: pageText
      }, { pageNo: page.pageNo, claimCount, ...details });
    };
    logStage('STRUCTURING:start', page.method, pageStartedAt, 0, 0);

    let rawEvidenceList: any[] = [];
    let rawClaimsList: any[] = [];
    let aiFailed = false;

    if (ai) {
      const aiStartedAt = Date.now();
      logStage('AI EXTRACTION:start', `Gemini (${env.GEMINI_MODEL})`, aiStartedAt, 0, 0);
      try {
        const response = await ai.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Analyze the following document text from page ${page.pageNo} and extract structured legal evidence and explicit factual claims.\n\nDOCUMENT TEXT (PAGE ${page.pageNo}):\n"""\n${pageText}\n"""`
                }
              ]
            }
          ],
          config: {
            systemInstruction: EVIDENCE_EXTRACTION_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                evidence: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      evidenceType: { type: Type.STRING },
                      factLabel: { type: Type.STRING },
                      factText: { type: Type.STRING },
                      entity: { type: Type.STRING },
                      dateRaw: { type: Type.STRING },
                      amountRaw: { type: Type.STRING },
                      sourceQuote: { type: Type.STRING }
                    },
                    required: ['evidenceType', 'factLabel', 'factText', 'sourceQuote']
                  }
                },
                claims: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      claimText: { type: Type.STRING },
                      claimKind: { type: Type.STRING },
                      sourceQuote: { type: Type.STRING }
                    },
                    required: ['claimText', 'claimKind', 'sourceQuote']
                  }
                }
              },
              required: ['evidence']
            }
          }
        });

        const outputText = response.text || '{}';
        const parsed = JSON.parse(outputText);
        rawEvidenceList = parsed.evidence || [];
        rawClaimsList = parsed.claims || [];
      } catch (llmErr) {
        aiFailed = true;
        const authRejected = disableGeminiForAuthenticationError(llmErr);
        if (!authRejected) {
          console.error(`[EvidenceAgent] Gemini extraction failed for ${context.filename || 'document'} page ${page.pageNo}:`, llmErr);
        }
        logStage('AI EXTRACTION:error', `Gemini (${env.GEMINI_MODEL})`, aiStartedAt, 0, 0, {
          fallback: authRejected ? 'deterministic' : undefined,
          error: authRejected ? 'Authentication rejected; deterministic fallback selected.' : llmErr instanceof Error ? llmErr.message : String(llmErr)
        });
      }
      logStage('AI EXTRACTION:complete', `Gemini (${env.GEMINI_MODEL})`, aiStartedAt, rawEvidenceList.length, rawClaimsList.length, { aiFailed });
    }

    // Fallback/Deterministic heuristic extractor if LLM is unavailable or returned empty on legal patterns
    if (rawEvidenceList.length === 0) {
      rawEvidenceList = extractDeterministicHeuristics(pageText, page.pageNo);
      rawClaimsList = extractDeterministicClaims(pageText, page.pageNo);
    }

    const groundingStartedAt = Date.now();
    logStage('GROUNDING:start', 'exact source quote validation', groundingStartedAt, 0, 0);
    const pageRejectionCount = rejectionCount;

    // Verify grounding and compute confidence for each item
    for (const item of rawEvidenceList) {
      const quote = typeof item.sourceQuote === 'string' ? item.sourceQuote.trim().slice(0, 300) : '';
      const isGrounded = verifyQuoteGrounding(pageText, quote);
      const unsupportedValues = [item.entity, item.dateRaw, item.amountRaw].filter(value =>
        typeof value === 'string' && value.trim().length > 0 && !quote.includes(value.trim())
      );

      if (!isGrounded || unsupportedValues.length > 0) {
        console.warn(`[Evidence Grounding] Rejected ungrounded AI fact on ${context.filename || 'document'} page ${page.pageNo}:`, JSON.stringify({
          quote: quote.slice(0, 60),
          unsupportedValues
        }));
        rejectionCount++;
        continue;
      }

      const dateValue = item.dateRaw ? parseLegalDate(item.dateRaw) : null;
      let amountValue: number | null = null;
      let currency: string | null = null;

      if (item.amountRaw) {
        const amt = parseIndianAmount(item.amountRaw);
        amountValue = amt.value;
        currency = amt.currency;
      }

      // Compute rule-based confidence
      const basis: Record<string, number> = {};
      let confScore = 0.0;

      // 1. Verbatim quote match
      if (pageText.includes(quote)) {
        confScore += 0.40;
        basis['exact_quote_match'] = 0.40;
      } else {
        confScore += 0.25;
        basis['normalized_quote_match'] = 0.25;
      }

      // 2. Extraction source method
      if (page.method === 'text_layer' || page.method === 'plain_text') {
        confScore += 0.25;
        basis['clean_text_layer'] = 0.25;
      } else {
        confScore += 0.10;
        basis['ocr_extraction'] = 0.10;
      }

      // 3. Clear date/amount parsing
      if (dateValue || amountValue != null) {
        confScore += 0.20;
        basis['parsed_structured_scalar'] = 0.20;
      }

      // 4. Entity presence
      if (item.entity && item.entity.trim().length > 0) {
        confScore += 0.15;
        basis['entity_identified'] = 0.15;
      }

      const finalConfidence = Math.min(1.0, Math.round(confScore * 100) / 100);

      allEvidence.push({
        evidenceType: isEvidenceType(item.evidenceType) ? item.evidenceType : 'statement',
        factLabel: item.factLabel || 'Document Fact',
        factText: typeof item.factText === 'string' && pageText.includes(item.factText.trim())
          ? item.factText.trim()
          : quote,
        entity: item.entity || null,
        dateValue,
        dateRaw: item.dateRaw || null,
        amountValue,
        currency,
        amountRaw: item.amountRaw || null,
        sourceQuote: quote.slice(0, 300),
        pageNo: page.pageNo,
        confidence: finalConfidence,
        confidenceBasis: basis
      });
    }

    for (const c of rawClaimsList) {
      const quote = typeof c.sourceQuote === 'string' ? c.sourceQuote.trim().slice(0, 300) : '';
      if (verifyQuoteGrounding(pageText, quote) && typeof c.claimText === 'string' && c.claimText.trim()) {
        allClaims.push({
          claimText: c.claimText.trim(),
          claimKind: isClaimKind(c.claimKind) ? c.claimKind : 'other',
          sourceQuote: quote,
          pageNo: page.pageNo
        });
      } else if (quote) {
        rejectionCount++;
      }
    }

    const deterministic = extractDeterministicEvidence(pageText, page.pageNo);
    for (const item of deterministic.evidence) {
      const existingIndex = allEvidence.findIndex(existing =>
        existing.pageNo === item.pageNo &&
        existing.evidenceType === item.evidenceType &&
        existing.sourceQuote === item.sourceQuote
      );
      if (existingIndex === -1) {
        allEvidence.push(item);
      } else {
        const existing = allEvidence[existingIndex];
        allEvidence[existingIndex] = {
          ...existing,
          entity: existing.entity || item.entity,
          dateValue: existing.dateValue || item.dateValue,
          dateRaw: existing.dateRaw || item.dateRaw,
          amountValue: existing.amountValue ?? item.amountValue,
          amountRaw: existing.amountRaw || item.amountRaw,
          currency: existing.currency || item.currency
        };
      }
    }
    for (const claim of deterministic.claims) {
      if (!allClaims.some(existing => existing.pageNo === claim.pageNo && existing.sourceQuote === claim.sourceQuote)) {
        allClaims.push(claim);
      }
    }

    const pageEvidenceCount = allEvidence.filter(item => item.pageNo === page.pageNo).length;
    const pageClaimCount = allClaims.filter(item => item.pageNo === page.pageNo).length;
    logStage('GROUNDING:complete', 'exact source quote validation', groundingStartedAt, pageEvidenceCount, pageClaimCount, {
      rejectedUngroundedCount: rejectionCount - pageRejectionCount
    });
    const validationStartedAt = Date.now();
    logStage('VALIDATION:complete', aiFailed ? 'deterministic fallback after Gemini error' : ai ? 'Gemini + deterministic fallback' : 'deterministic fallback', validationStartedAt, pageEvidenceCount, pageClaimCount, {
      rejectedUngroundedCount: rejectionCount - pageRejectionCount
    });
    logStage('STRUCTURING:complete', aiFailed ? 'deterministic fallback after Gemini error' : ai ? 'Gemini + deterministic fallback' : 'deterministic fallback', pageStartedAt, pageEvidenceCount, pageClaimCount, {
      rejectedUngroundedCount: rejectionCount - pageRejectionCount
    });
  }

  return {
    evidence: allEvidence,
    claims: allClaims,
    rejectionCount
  };
}

function isClaimKind(value: unknown): value is ExtractedClaimItem['claimKind'] {
  return value === 'payment_completed' || value === 'delivery_completed' || value === 'contract_exists' || value === 'amount_owed' || value === 'other';
}

function isEvidenceType(value: unknown): value is string {
  return typeof value === 'string' && [
    'contract_term', 'invoice_line', 'invoice_total', 'payment', 'delivery',
    'communication', 'statement', 'party_identification', 'date_event', 'obligation', 'other'
  ].includes(value);
}

function classifyClaim(text: string): ExtractedClaimItem['claimKind'] {
  if (/payment|paid|transfer|remittance/i.test(text)) return 'payment_completed';
  if (/deliver|shipment|dispatch|consignment/i.test(text)) return 'delivery_completed';
  if (/contract|agreement/i.test(text)) return 'contract_exists';
  if (/owed|debt|outstanding|due|invoice|amount/i.test(text)) return 'amount_owed';
  return 'other';
}

export function extractDeterministicEvidence(text: string, pageNo: number): EvidenceExtractionResult {
  const evidence: ExtractedEvidenceItem[] = [];
  const claims: ExtractedClaimItem[] = [];
  const segments = text
    .split(/\r?\n+/)
    .flatMap(line => line.split(/(?<=[.!?])\s+/))
    .map(line => line.trim())
    .filter(line => line.length >= 15);
  const months = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  const datePattern = new RegExp(`\\b(?:\\d{1,2}\\s+(?:${months})\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{4})\\b`, 'gi');
  const amountPattern = /(?:₹\s*|¹\s*|\bINR\s*|\bRs\.?\s*|\bUSD\s*|\$\s*|€\s*|£\s*)\d[\d,]*(?:\.\d{1,2})?|\b(?:amount\s+(?:transferred|paid|received)|recorded\s+payment\s+amount|invoice\s+total(?:\s+amount)?|grand\s+total|total\s+amount|total\s+price|contract\s+value)\s*[:=-]?\s*\d[\d,]*(?:\.\d{1,2})?/gi;

  const addEvidence = (segment: string, type: string, label: string, values: Partial<ExtractedEvidenceItem> = {}) => {
    const quote = segment.slice(0, 300);
    if (!verifyQuoteGrounding(text, quote)) return;
    if (evidence.some(item => item.evidenceType === type && item.sourceQuote === quote && item.factLabel === label)) return;
    const scalar = values.amountRaw ? parseIndianAmount(values.amountRaw) : null;
    evidence.push({
      evidenceType: type,
      factLabel: label,
      factText: segment,
      sourceQuote: quote,
      pageNo,
      confidence: 0.9,
      confidenceBasis: { exact_source_quote: 0.9, deterministic_rule: 0.1 },
      entity: values.entity || null,
      dateValue: values.dateRaw ? parseLegalDate(values.dateRaw) : null,
      dateRaw: values.dateRaw || null,
      amountValue: values.amountValue ?? scalar?.value ?? null,
      currency: values.currency || scalar?.currency || null,
      amountRaw: values.amountRaw || null
    });
  };

  for (const segment of segments) {
    const lower = segment.toLowerCase();
    const partyMatch = segment.match(/\b(BUYER|SELLER|SUPPLIER|PURCHASER|PLAINTIFF|DEFENDANT|CLIENT|CUSTOMER|PARTY\s+[A-Z])\s*(?::|is)\s*([^,.;]+)/i);
    if (partyMatch) addEvidence(segment, 'party_identification', `${partyMatch[1]} identification`, { entity: partyMatch[2].trim() });

    const invoiceId = segment.match(/\b(?:tax\s+)?invoice\s*(?:no\.?|number|#|ref(?:erence)?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{2,})/i);
    if (invoiceId) addEvidence(segment, 'invoice_line', 'Invoice Number', { entity: invoiceId[1] });

    const contractId = segment.match(/\b(?:contract|agreement)\s+(?:no\.?|number|#|ref(?:erence)?|order)\s*[:(#-]\s*([A-Z][A-Z0-9/-]{2,})/i)
      || (/\b(?:master\s+)?supply\s+agreement\b/i.test(segment) ? segment.match(/\bref(?:erence)?\s*[:(#-]\s*([A-Z][A-Z0-9/-]{2,})/i) : null);
    if (contractId) addEvidence(segment, 'contract_term', 'Contract / Agreement Number', { entity: contractId[1] });

    for (const amountMatch of segment.matchAll(amountPattern)) {
      const amountRaw = amountMatch[0].match(/(?:₹|¹|INR|Rs\.?|USD|\$|€|£)?\s*\d[\d,]*(?:\.\d{1,2})?/i)?.[0].trim() || amountMatch[0].trim();
      const type = /invoice|grand total|total price|total amount|contract value|consideration/i.test(lower)
        ? 'invoice_total'
        : /payment|paid|transfer|remittance|bank|credit/i.test(lower)
        ? 'payment'
        : /contract|agreement|obligation|shall|must/i.test(lower)
        ? 'contract_term'
        : 'statement';
      const label = type === 'invoice_total' ? 'Invoice / Contract Amount' : type === 'payment' ? 'Payment Amount' : 'Amount Stated';
      addEvidence(segment, type, label, { amountRaw });
    }

    datePattern.lastIndex = 0;
    for (const dateMatch of segment.matchAll(datePattern)) {
      const dateRaw = dateMatch[0];
      const isDelivery = /deliver|shipment|dispatch|consignment/i.test(lower);
      const isObligation = /shall|must|deadline|due|on or before|within\s+\d+/i.test(lower);
      const type = isDelivery && isObligation ? 'contract_term' : isDelivery ? 'delivery' : isObligation ? 'obligation' : 'date_event';
      const label = type === 'delivery' ? 'Delivery Date' : type === 'contract_term' ? 'Contractual Delivery / Deadline' : type === 'obligation' ? 'Deadline / Obligation Date' : 'Date Event';
      addEvidence(segment, type, label, { dateRaw });
    }

    if (/payment\s+terms?|payable\s+within|payment\s+due|upon\s+(?:receipt|dispatch|delivery)|within\s+\d+\s+days/i.test(lower)) {
      addEvidence(segment, 'contract_term', 'Payment Terms');
    }
    if (/\b(?:shall|must|undertakes?|covenants?|agrees?\s+to|is\s+required\s+to|obligation)\b/i.test(lower)) {
      addEvidence(segment, 'obligation', 'Contractual Obligation');
    }
    if (/\b(?:alleges?|allegation|claims?|asserts?|breach|default|failed\s+to|did\s+not|has\s+not|not\s+delivered|payment\s+(?:was|has\s+been|is)\s+(?:completed|made)|full\s+payment\s+made)\b/i.test(lower)) {
      addEvidence(segment, 'statement', 'Claim / Breach Allegation');
      const claim: ExtractedClaimItem = {
        claimText: segment,
        claimKind: classifyClaim(segment),
        sourceQuote: segment.slice(0, 300),
        pageNo
      };
      if (verifyQuoteGrounding(text, claim.sourceQuote) && !claims.some(item => item.sourceQuote === claim.sourceQuote)) claims.push(claim);
    }
  }

  if (evidence.length === 0 && segments.length > 0) addEvidence(segments[0], 'statement', 'Document Statement');
  return { evidence, claims, rejectionCount: 0 };
}

function extractDeterministicHeuristics(text: string, pageNo: number): any[] {
  const items: any[] = [];

  // Match Invoice Total
  const invTotalMatch = text.match(/(?:invoice\s+total|total\s+amount|grand\s+total)[^\d₹Rs]*([₹Rs\$\.\d,\s]+)/i);
  if (invTotalMatch) {
    const rawAmt = invTotalMatch[1].trim();
    items.push({
      evidenceType: 'invoice_total',
      factLabel: 'Invoice Total Amount',
      factText: `Invoice total of ${rawAmt}`,
      amountRaw: rawAmt,
      sourceQuote: invTotalMatch[0].slice(0, 200)
    });
  }

  // Match Payment amount
  const paymentMatch = text.match(/(?:payment\s+received|amount\s+paid|transferred\s+sum\s+of|credit\s+of)[^\d₹Rs]*([₹Rs\$\.\d,\s]+)/i);
  if (paymentMatch) {
    const rawAmt = paymentMatch[1].trim();
    items.push({
      evidenceType: 'payment',
      factLabel: 'Recorded Payment Amount',
      factText: `Payment record indicates ${rawAmt}`,
      amountRaw: rawAmt,
      sourceQuote: paymentMatch[0].slice(0, 200)
    });
  }

  // Match Delivery Date
  const deliveryMatch = text.match(/(?:delivery\s+date|delivered\s+on|consignment\s+received\s+on)[^\d\w]*([0-9]{1,2}[a-z\s]+[0-9]{4}|[0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i);
  if (deliveryMatch) {
    const rawDate = deliveryMatch[1].trim();
    items.push({
      evidenceType: 'delivery',
      factLabel: 'Recorded Delivery Date',
      factText: `Delivery recorded on ${rawDate}`,
      dateRaw: rawDate,
      sourceQuote: deliveryMatch[0].slice(0, 200)
    });
  }

  // Match Contract Term Delivery Date
  const contractDeliveryMatch = text.match(/(?:delivery\s+shall\s+be\s+completed\s+on\s+or\s+before|agreed\s+delivery\s+date)[^\d\w]*([0-9]{1,2}[a-z\s]+[0-9]{4}|[0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/i);
  if (contractDeliveryMatch) {
    const rawDate = contractDeliveryMatch[1].trim();
    items.push({
      evidenceType: 'contract_term',
      factLabel: 'Contractual Delivery Schedule',
      factText: `Agreed delivery schedule is ${rawDate}`,
      dateRaw: rawDate,
      sourceQuote: contractDeliveryMatch[0].slice(0, 200)
    });
  }

  return items;
}

function extractDeterministicClaims(text: string, pageNo: number): ExtractedClaimItem[] {
  const claims: ExtractedClaimItem[] = [];

  if (/(?:payment\s+(?:was|has\s+been|is)\s+completed|we\s+have\s+paid\s+the\s+invoice|full\s+payment\s+made)/i.test(text)) {
    const match = text.match(/([^\.\n]*(?:payment|paid)[^\.\n]*)/i);
    claims.push({
      claimText: match ? match[1].trim() : 'Payment completed as asserted by client',
      claimKind: 'payment_completed',
      sourceQuote: match ? match[0].trim().slice(0, 250) : 'Payment completed',
      pageNo
    });
  }

  return claims;
}

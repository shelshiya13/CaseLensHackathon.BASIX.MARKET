import { CaseStateClaim, CaseStateEvidence } from '../state/caseState.js';

export interface EvaluatedMissingEvidence {
  claimId?: string;
  requiredItem: string;
  rationale: string;
  basisEvidenceIds: string[];
  status: 'open' | 'satisfied';
}

export function evaluateMissingEvidenceRules(
  claims: CaseStateClaim[],
  evidenceList: CaseStateEvidence[]
): EvaluatedMissingEvidence[] {
  const activeEvidence = evidenceList.filter(e => e.status === 'active');
  const results: EvaluatedMissingEvidence[] = [];

  for (const claim of claims) {
    const basisEvidence = evidenceList.find(e => e.id === claim.claimSourceEvidenceId);
    const basisRef = basisEvidence ? basisEvidence.ref : 'the source document';

    switch (claim.claimKind) {
      case 'payment_completed': {
        // Requires payment receipt OR bank transaction record OR bank statement
        const hasPaymentCorroboration = activeEvidence.some(e =>
          e.type === 'payment' ||
          (e.amount != null && (
            e.fact.toLowerCase().includes('bank') ||
            e.fact.toLowerCase().includes('transaction') ||
            e.fact.toLowerCase().includes('paid') ||
            e.fact.toLowerCase().includes('transfer')
          ))
        );

        results.push({
          claimId: claim.id,
          requiredItem: 'Official payment receipt or bank transaction record',
          rationale: `Payment confirmation is not present in the uploaded evidence. (Asserted in ${basisRef}: "${claim.claimText}")`,
          basisEvidenceIds: [claim.claimSourceEvidenceId],
          status: hasPaymentCorroboration ? 'satisfied' : 'open'
        });
        break;
      }

      case 'delivery_completed': {
        // Requires delivery challan / proof of delivery / signed receipt
        const hasDeliveryCorroboration = activeEvidence.some(e =>
          e.type === 'delivery' ||
          e.fact.toLowerCase().includes('challan') ||
          e.fact.toLowerCase().includes('consignment note') ||
          e.fact.toLowerCase().includes('delivery receipt')
        );

        results.push({
          claimId: claim.id,
          requiredItem: 'Delivery challan, consignment note, or signed proof of delivery',
          rationale: `Proof of delivery is not present in the uploaded evidence. (Asserted in ${basisRef}: "${claim.claimText}")`,
          basisEvidenceIds: [claim.claimSourceEvidenceId],
          status: hasDeliveryCorroboration ? 'satisfied' : 'open'
        });
        break;
      }

      case 'contract_exists': {
        // Requires signed contract / agreement
        const hasContract = activeEvidence.some(e =>
          e.type === 'contract_term' ||
          e.fact.toLowerCase().includes('agreement') ||
          e.fact.toLowerCase().includes('contract')
        );

        results.push({
          claimId: claim.id,
          requiredItem: 'Executed written agreement or signed contract',
          rationale: `Signed contract document is not present in the uploaded evidence. (Asserted in ${basisRef}: "${claim.claimText}")`,
          basisEvidenceIds: [claim.claimSourceEvidenceId],
          status: hasContract ? 'satisfied' : 'open'
        });
        break;
      }

      case 'amount_owed': {
        // Requires invoice or statement of account
        const hasInvoice = activeEvidence.some(e =>
          e.type === 'invoice_total' ||
          e.type === 'invoice_line' ||
          e.fact.toLowerCase().includes('invoice') ||
          e.fact.toLowerCase().includes('bill')
        );

        results.push({
          claimId: claim.id,
          requiredItem: 'Tax invoice or itemized statement of account',
          rationale: `Underlying invoice supporting the claimed outstanding amount is not present in the uploaded evidence. (Asserted in ${basisRef}: "${claim.claimText}")`,
          basisEvidenceIds: [claim.claimSourceEvidenceId],
          status: hasInvoice ? 'satisfied' : 'open'
        });
        break;
      }

      default:
        break;
    }
  }

  return results;
}

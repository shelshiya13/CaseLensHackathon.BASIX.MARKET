import { CaseStateEvidence } from '../state/caseState.js';

export interface EvaluatedConflict {
  conflictType: string;
  evidenceAId: string;
  evidenceBId: string;
  description: string;
  whyItMatters: string;
  severity: 'High' | 'Medium' | 'Low';
  severityBasis: string;
}

export function evaluateDeterministicConflicts(evidenceList: CaseStateEvidence[]): EvaluatedConflict[] {
  const conflicts: EvaluatedConflict[] = [];
  const activeEvidence = evidenceList.filter(e => e.status === 'active');

  // 1. Amount Mismatches (e.g., invoice_total vs payment / amount_owed)
  const invoiceTotals = activeEvidence.filter(e =>
    e.type === 'invoice_total' || (e.amount != null && e.fact.toLowerCase().includes('invoice'))
  );
  const payments = activeEvidence.filter(e =>
    e.type === 'payment' || (e.amount != null && (e.fact.toLowerCase().includes('payment') || e.fact.toLowerCase().includes('paid') || e.fact.toLowerCase().includes('bank')))
  );

  const uniquePayments = [...new Map(payments.map(payment => [
    `${payment.docId}|${payment.currency}|${payment.amount}`,
    payment
  ])).values()];

  for (const inv of invoiceTotals) {
    for (const pay of uniquePayments) {
      if (inv.id === pay.id) continue;
      if (inv.amount != null && pay.amount != null && inv.currency === pay.currency) {
        if (inv.amount !== pay.amount) {
          const diff = Math.abs(inv.amount - pay.amount);
          const maxAmount = Math.max(inv.amount, pay.amount);
          const percentDiff = maxAmount > 0 ? (diff / maxAmount) * 100 : 0;

          let severity: 'High' | 'Medium' | 'Low' = 'Low';
          let basis = `Variance of ${percentDiff.toFixed(1)}% (${inv.currency || ''} ${(diff / 100).toLocaleString()})`;

          if (percentDiff > 15 || diff >= 5000000) { // > ₹50,000 in minor units
            severity = 'High';
            basis = `Substantial variance exceeding 15% (${percentDiff.toFixed(1)}% / ${inv.currency || ''} ${(diff / 100).toLocaleString()} discrepancy)`;
          } else if (percentDiff > 5) {
            severity = 'Medium';
            basis = `Moderate variance of ${percentDiff.toFixed(1)}%`;
          }

          const formattedInv = (inv.amount / 100).toLocaleString();
          const formattedPay = (pay.amount / 100).toLocaleString();

          conflicts.push({
            conflictType: 'amount_mismatch',
            evidenceAId: inv.id,
            evidenceBId: pay.id,
            description: `Amount mismatch between ${inv.ref} (${inv.currency || '₹'} ${formattedInv}) and ${pay.ref} (${pay.currency || '₹'} ${formattedPay}).`,
            whyItMatters: 'The records contain inconsistent payment information regarding the amount invoiced versus the amount recorded as received.',
            severity,
            severityBasis: basis
          });
        }
      }
    }
  }

  // 2. Date Mismatches (e.g. Contract delivery deadline vs Actual delivery date)
  const contractDeadlines = activeEvidence.filter(e =>
    (e.type === 'contract_term' || e.type === 'obligation') &&
    e.date &&
    (e.fact.toLowerCase().includes('delivery') || e.fact.toLowerCase().includes('deliver') || e.fact.toLowerCase().includes('completion'))
  );
  const deliveryEvents = activeEvidence.filter(e =>
    (e.type === 'delivery' || e.type === 'date_event') &&
    e.date &&
    (e.fact.toLowerCase().includes('delivery') || e.fact.toLowerCase().includes('received') || e.fact.toLowerCase().includes('delivered') || e.fact.toLowerCase().includes('challan'))
  );

  const uniqueDeadlines = [...new Map(contractDeadlines.map(item => [`${item.type}|${item.date}`, item])).values()];
  const uniqueDeliveryEvents = [...new Map(deliveryEvents.map(item => [`${item.type}|${item.date}`, item])).values()];

  for (const c of uniqueDeadlines) {
    for (const d of uniqueDeliveryEvents) {
      if (c.id === d.id) continue;
      if (c.date && d.date && c.date !== d.date) {
        const promisedDate = new Date(c.date);
        const actualDate = new Date(d.date);

        const isDelayed = actualDate > promisedDate;
        const diffDays = Math.round(Math.abs(actualDate.getTime() - promisedDate.getTime()) / (1000 * 60 * 60 * 24));

        let severity: 'High' | 'Medium' | 'Low' = 'Medium';
        let basis = `Date difference of ${diffDays} day(s)`;

        if (isDelayed) {
          severity = diffDays > 5 ? 'High' : 'Medium';
          basis = `Actual delivery (${d.date}) occurred ${diffDays} day(s) after agreed contractual deadline (${c.date})`;
        } else {
          severity = 'Low';
          basis = `Delivery recorded on ${d.date} differs from scheduled ${c.date}`;
        }

        conflicts.push({
          conflictType: 'date_mismatch',
          evidenceAId: c.id,
          evidenceBId: d.id,
          description: `Contractual delivery deadline in ${c.ref} (${c.date}) differs from recorded delivery in ${d.ref} (${d.date}).`,
          whyItMatters: isDelayed
            ? `The recorded delivery date indicates an apparent breach of delivery schedule by ${diffDays} days.`
            : `Discrepancy in recorded execution timeline versus agreed contractual date.`,
          severity,
          severityBasis: basis
        });
      }
    }
  }

  // Deduplicate symmetrical pairs (e.g., A-B vs B-A)
  const uniqueKeyMap = new Set<string>();
  const filtered: EvaluatedConflict[] = [];

  for (const c of conflicts) {
    const pairKey = [c.evidenceAId, c.evidenceBId].sort().join('::') + `::${c.conflictType}`;
    if (!uniqueKeyMap.has(pairKey)) {
      uniqueKeyMap.add(pairKey);
      filtered.push(c);
    }
  }

  return filtered;
}

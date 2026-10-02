import React, { useState } from 'react';
import {
  FileText,
  Search,
  Filter,
  Check,
  Edit3,
  XCircle,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  History,
  CheckCircle2
} from 'lucide-react';
import { apiRequest } from '../../../lib/api.js';
import { formatCurrency, formatDate, formatDateTime } from '../../../lib/format.js';
import { EmptyState } from '../../../components/EmptyState.js';
import { EvidenceStrengthBadge } from '../../../components/EvidenceStrengthBadge.js';
import { getEvidenceStrength } from '../../../lib/evidenceStrength.js';

interface EvidenceTabProps {
  caseId: string;
  evidence: any[];
  findings: any[];
  isClosed: boolean;
  onRefresh: () => void;
  onOpenSourceViewer: (eid: string) => void;
}

export const EvidenceTab: React.FC<EvidenceTabProps> = ({
  caseId,
  evidence,
  findings,
  isClosed,
  onRefresh,
  onOpenSourceViewer
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Correction Modal State
  const [correctionTarget, setCorrectionTarget] = useState<any | null>(null);
  const [fieldToCorrect, setFieldToCorrect] = useState<'amount' | 'date' | 'factText' | 'entity'>('amount');
  const [correctedValue, setCorrectedValue] = useState('');
  const [reason, setReason] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  const filteredEvidence = evidence.filter(e => {
    const matchesSearch =
      e.evidence_ref.toLowerCase().includes(search.toLowerCase()) ||
      e.fact_text.toLowerCase().includes(search.toLowerCase()) ||
      e.source_quote.toLowerCase().includes(search.toLowerCase()) ||
      (e.entity && e.entity.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || e.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || e.evidence_type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const handleConfirm = async (eid: string) => {
    if (isClosed) return;
    setActionError(null);
    try {
      await apiRequest(`/api/evidence/${eid}/review`, {
        method: 'POST',
        body: JSON.stringify({ action: 'confirm', reason: 'Confirmed by legal counsel.' })
      });
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to confirm evidence.');
    }
  };

  const handleReject = async (eid: string) => {
    if (isClosed) return;
    const target = evidence.find(item => item.id === eid);
    if (!target) return;
    setRejectTarget(target);
    setRejectReason('');
    setActionError(null);
  };

  const handleSubmitReject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rejectTarget || !rejectReason.trim() || submittingReject) return;
    setSubmittingReject(true);
    try {
      await apiRequest(`/api/evidence/${rejectTarget.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action: 'reject', reason: rejectReason.trim() })
      });
      setRejectTarget(null);
      setRejectReason('');
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject evidence.');
    } finally {
      setSubmittingReject(false);
    }
  };

  const openCorrectionModal = (item: any) => {
    setCorrectionTarget(item);
    setFieldToCorrect(item.amount_raw ? 'amount' : item.date_raw ? 'date' : 'factText');
    setCorrectedValue(item.amount_raw || item.date_raw || item.fact_text);
    setReason('');
    setReviewError(null);
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget) return;
    setReviewError(null);
    setSubmittingReview(true);

    try {
      await apiRequest(`/api/evidence/${correctionTarget.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'correct_value',
          fieldToCorrect,
          correctedValue: correctedValue.trim(),
          reason: reason.trim()
        })
      });
      setCorrectionTarget(null);
      onRefresh();
    } catch (err: any) {
      setReviewError(err.message || 'Failed to submit correction');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="bg-white p-4 border border-[#E4DFD3] rounded-md shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#5C5E66]" />
          <input
            type="text"
            placeholder="Search evidence ref, quote, facts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
          >
            <option value="ALL">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="challenged">Challenged</option>
            <option value="corrected">Corrected</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
          >
            <option value="ALL">All Types</option>
            <option value="contract_term">Contract Term</option>
            <option value="invoice_total">Invoice Total</option>
            <option value="payment">Payment</option>
            <option value="delivery">Delivery</option>
            <option value="statement">Statement</option>
            <option value="communication">Communication</option>
          </select>

          <span className="font-mono text-xs text-[#5C5E66] ml-2">
            {filteredEvidence.length} of {evidence.length} items
          </span>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="p-3 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-sm text-[#9B2C2C] flex items-center justify-between gap-3">
          <span>{actionError}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setActionError(null)}><XCircle className="w-4 h-4" /></button>
        </div>
      )}

      {/* Evidence Items List */}
      {filteredEvidence.length === 0 ? (
        <EmptyState
          title="No evidence uploaded"
          description={
            evidence.length === 0
              ? 'Upload documents to the case to extract grounded structured evidence.'
              : 'No evidence matches your search criteria.'
          }
          icon={FileText}
        />
      ) : (
        <div className="space-y-3">
          {filteredEvidence.map(item => {
            const isCorrected = item.status === 'corrected';
            const isRejected = item.status === 'rejected';

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-md shadow-sm p-4 transition-colors ${
                  isCorrected
                    ? 'border-[#E4DFD3] bg-[#FAF7F0]/40 opacity-80'
                    : isRejected
                    ? 'border-[#F8B4B4] bg-[#FDF2F2]/30 opacity-70'
                    : 'border-[#E4DFD3] hover:border-[#14213D]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 pb-2.5 border-b border-[#E4DFD3]/80 mb-3">
                  <div className="min-w-0 flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-xs text-[#14213D] px-2 py-0.5 bg-[#FAF7F0] border border-[#E4DFD3] rounded">
                      {item.evidence_ref}
                    </span>
                    <EvidenceStrengthBadge strength={getEvidenceStrength(item, findings)} compact />
                    <span className="min-w-0 text-xs font-semibold text-[#2B2D33] break-words">{item.fact_label}</span>
                    <span className="text-[10px] px-2 py-0.2 rounded bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0] uppercase tracking-wider font-mono">
                      {item.evidence_type}
                    </span>

                    {/* Status indicator */}
                    {isCorrected && (
                      <span className="text-[11px] text-[#B7791F] font-mono italic">
                        [Superseded by human correction]
                      </span>
                    )}
                    {isRejected && (
                      <span className="text-[11px] text-[#9B2C2C] font-mono italic">
                        [Rejected by counsel]
                      </span>
                    )}
                  </div>

                  <div className="self-start flex flex-wrap items-center gap-2">
                    {item.confidence != null && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-[#F0FDF4] text-[#2F6B4F] border border-[#BCF0DA]"
                        title={item.confidence_basis ? JSON.stringify(item.confidence_basis) : 'Confidence'}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>{(item.confidence * 100).toFixed(0)}%</span>
                      </span>
                    )}

                    <button
                      onClick={() => onOpenSourceViewer(item.id)}
                      className="px-2 py-1 text-xs text-[#14213D] hover:bg-[#FAF7F0] border border-[#E4DFD3] rounded inline-flex items-center gap-1 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3 text-[#B08D57]" />
                      <span>View Source</span>
                    </button>
                  </div>
                </div>

                {item.confidence != null && (
                  <div role="meter" aria-label={`${item.evidence_ref} extraction confidence`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.confidence * 100)} className="h-1 mb-3 rounded-full bg-[#EAF5F3] overflow-hidden">
                    <div className="h-full bg-[#176B68]" style={{ width: `${Math.max(0, Math.min(100, item.confidence * 100))}%` }} />
                  </div>
                )}

                {/* Fact Text & Scalars */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                  <div className="md:col-span-3 space-y-2">
                    <p className={`text-[#2B2D33] leading-relaxed ${isCorrected ? 'line-through text-[#5C5E66]' : ''}`}>
                      {item.fact_text}
                    </p>

                    <div className="p-2 bg-[#FEFCE8] text-[#2B2D33] border border-[#FCE96A] rounded font-mono text-[11px] leading-relaxed">
                      <span className="font-sans font-bold text-[#5C5E66] mr-1">Quote:</span>
                      "{item.source_quote}"
                    </div>

                    {item.validation_notes && (
                      <div className="text-[11px] text-[#B7791F] italic">
                        Note: {item.validation_notes}
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-[#FAF7F0] border border-[#E4DFD3] rounded space-y-2 text-xs flex flex-col justify-between">
                    <div>
                      {item.amount_raw && (
                        <div className="mb-1.5">
                          <span className="text-[10px] text-[#5C5E66] block uppercase tracking-wider">Amount</span>
                          <span className="font-mono font-bold text-[#14213D] text-sm">{item.amount_raw}</span>
                        </div>
                      )}

                      {item.date_raw && (
                        <div className="mb-1.5">
                          <span className="text-[10px] text-[#5C5E66] block uppercase tracking-wider">Date</span>
                          <span className="font-mono font-medium text-[#2B2D33]">{item.date_raw}</span>
                        </div>
                      )}

                      <div>
                        <span className="text-[10px] text-[#5C5E66] block uppercase tracking-wider">Document Citation</span>
                        <span className="font-medium text-[#2B2D33] truncate block">{item.document_filename}</span>
                        <span className="text-[#5C5E66] text-[11px]">Page {item.page_no}</span>
                      </div>
                    </div>

                    {/* Human In The Loop Actions */}
                    {!isClosed && !isCorrected && !isRejected && (
                      <div className="pt-2 border-t border-[#E4DFD3] flex items-center justify-between gap-1">
                        <button
                          onClick={() => handleConfirm(item.id)}
                          className="px-2 py-1 text-[11px] bg-white hover:bg-[#F0FDF4] hover:text-[#2F6B4F] border border-[#E4DFD3] rounded text-[#5C5E66] inline-flex items-center gap-1 transition-colors"
                          title="Confirm evidence as accurate"
                        >
                          <Check className="w-3 h-3 text-[#2F6B4F]" />
                          <span>Confirm</span>
                        </button>

                        <button
                          onClick={() => openCorrectionModal(item)}
                          className="px-2 py-1 text-[11px] bg-white hover:bg-[#FAF7F0] hover:text-[#14213D] border border-[#E4DFD3] rounded text-[#5C5E66] inline-flex items-center gap-1 transition-colors"
                          title="Provide human correction"
                        >
                          <Edit3 className="w-3 h-3 text-[#B08D57]" />
                          <span>Correct</span>
                        </button>

                        <button
                          onClick={() => handleReject(item.id)}
                          className="px-2 py-1 text-[11px] bg-white hover:bg-[#FDF2F2] hover:text-[#9B2C2C] border border-[#E4DFD3] rounded text-[#5C5E66] inline-flex items-center gap-1 transition-colors"
                          title="Reject from evidence record"
                        >
                          <XCircle className="w-3 h-3 text-[#9B2C2C]" />
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Human Correction Modal Dialog */}
      {correctionTarget && (
        <div className="fixed inset-0 z-50 bg-[#0E172B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-md border border-[#E4DFD3] shadow-2xl max-w-lg w-full p-6 space-y-4 card-brass-top">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4DFD3]">
              <div>
                <h3 className="font-legal-heading text-base font-bold text-[#14213D]">
                  Human Evidence Correction
                </h3>
                <span className="font-mono text-xs text-[#5C5E66]">
                  Ref: {correctionTarget.evidence_ref} · {correctionTarget.document_filename} (p. {correctionTarget.page_no})
                </span>
              </div>
              <button
                onClick={() => setCorrectionTarget(null)}
                className="text-[#5C5E66] hover:text-[#14213D]"
              >
                ✕
              </button>
            </div>

            {reviewError && (
              <div className="p-2.5 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-xs text-[#9B2C2C]">
                {reviewError}
              </div>
            )}

            <form onSubmit={handleSubmitCorrection} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-[#2B2D33] mb-1">Select Field to Correct</label>
                <select
                  value={fieldToCorrect}
                  onChange={e => {
                    const f = e.target.value as any;
                    setFieldToCorrect(f);
                    if (f === 'amount') setCorrectedValue(correctionTarget.amount_raw || '');
                    else if (f === 'date') setCorrectedValue(correctionTarget.date_raw || '');
                    else if (f === 'factText') setCorrectedValue(correctionTarget.fact_text || '');
                    else if (f === 'entity') setCorrectedValue(correctionTarget.entity || '');
                  }}
                  className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
                >
                  <option value="amount">Monetary Amount</option>
                  <option value="date">Date Value</option>
                  <option value="factText">Fact Statement Text</option>
                  <option value="entity">Entity Name</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#5C5E66] mb-1">Original Extracted Value (Read-Only)</label>
                <div className="p-2 bg-[#FAF7F0] border border-[#E4DFD3] rounded font-mono text-[#5C5E66]">
                  {fieldToCorrect === 'amount'
                    ? correctionTarget.amount_raw || '—'
                    : fieldToCorrect === 'date'
                    ? correctionTarget.date_raw || '—'
                    : fieldToCorrect === 'factText'
                    ? correctionTarget.fact_text
                    : correctionTarget.entity || '—'}
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#2B2D33] mb-1">
                  Corrected Value <span className="text-[#9B2C2C]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={correctedValue}
                  onChange={e => setCorrectedValue(e.target.value)}
                  placeholder="Enter counsel-verified accurate value"
                  className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white font-mono focus:outline-none focus:border-[#14213D]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#2B2D33] mb-1">
                  Reason for Human Correction <span className="text-[#9B2C2C]">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Explain why the AI extraction was inaccurate or what the document actually states..."
                  className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
                />
              </div>

              <div className="pt-3 border-t border-[#E4DFD3] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCorrectionTarget(null)}
                  className="px-3 py-1.5 border border-[#E4DFD3] rounded hover:bg-[#FAF7F0] text-[#5C5E66]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="px-4 py-1.5 bg-[#14213D] text-white rounded font-semibold hover:bg-[#1E2D4A] transition-colors disabled:opacity-50"
                >
                  {submittingReview ? 'Submitting & Re-evaluating...' : 'Apply Correction & Trigger Re-analysis'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-[#0E172B]/60 flex items-center justify-center p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="reject-evidence-title" className="w-full max-w-md bg-white rounded-md border border-[#E4DFD3] shadow-2xl p-6 space-y-4">
            <div>
              <h3 id="reject-evidence-title" className="font-legal-heading text-lg font-semibold text-[#14213D]">Reject {rejectTarget.evidence_ref}?</h3>
              <p className="mt-1 text-sm text-[#5C5E66]">Add the legal or factual reason to preserve the review decision in the audit trail.</p>
            </div>
            <form onSubmit={handleSubmitReject} className="space-y-4">
              <label className="block text-sm font-medium text-[#2B2D33]">
                Reason for rejection
                <textarea autoFocus required rows={4} value={rejectReason} onChange={event => setRejectReason(event.target.value)} className="mt-1.5 w-full rounded border border-[#E4DFD3] p-3 text-sm focus:border-[#176B68]" />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" disabled={submittingReject} onClick={() => setRejectTarget(null)} className="px-4 py-2 border border-[#E4DFD3] rounded text-sm font-medium">Cancel</button>
                <button type="submit" disabled={submittingReject || !rejectReason.trim()} className="px-4 py-2 bg-[#9B2C2C] text-white rounded text-sm font-semibold disabled:opacity-50">{submittingReject ? 'Saving decision...' : 'Reject evidence'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

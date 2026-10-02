import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, ExternalLink, ShieldAlert, ArrowRight, ArrowLeftRight } from 'lucide-react';
import { apiRequest } from '../../../lib/api.js';
import { EmptyState } from '../../../components/EmptyState.js';

interface ConflictsTabProps {
  caseId: string;
  conflicts: any[];
  hasAnalysis: boolean;
  isClosed: boolean;
  onRefresh: () => void;
  onOpenSourceViewer: (eid: string) => void;
}

export const ConflictsTab: React.FC<ConflictsTabProps> = ({
  caseId,
  conflicts,
  hasAnalysis,
  isClosed,
  onRefresh,
  onOpenSourceViewer
}) => {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dismissTarget, setDismissTarget] = useState<any | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [submittingDismiss, setSubmittingDismiss] = useState(false);
  const [dismissError, setDismissError] = useState<string | null>(null);

  const filteredConflicts = conflicts.filter(c => {
    if (statusFilter === 'ALL') return true;
    return c.status === statusFilter;
  });
  const openCount = conflicts.filter(conflict => conflict.status === 'open').length;
  const highSeverityCount = conflicts.filter(conflict => conflict.status === 'open' && conflict.severity === 'High').length;
  const resolvedCount = conflicts.length - openCount;

  const handleDismiss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dismissTarget || !dismissReason.trim()) return;
    setDismissError(null);
    setSubmittingDismiss(true);

    try {
      await apiRequest(`/api/conflicts/${dismissTarget.id}/dismiss`, {
        method: 'POST',
        body: JSON.stringify({ reason: dismissReason.trim() })
      });
      setDismissTarget(null);
      setDismissReason('');
      onRefresh();
    } catch (err: any) {
      setDismissError(err.message || 'Failed to dismiss conflict.');
    } finally {
      setSubmittingDismiss(false);
    }
  };

  if (!hasAnalysis && conflicts.length === 0) {
    return (
      <EmptyState
        title="Analysis has not been run."
        description="Run analysis on active evidence documents to evaluate numerical, date, and contractual inconsistencies."
        icon={AlertTriangle}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3" aria-label="Conflict statistics">
        <div className="bg-white border border-[#F8B4B4] rounded-md p-3 sm:p-4">
          <span className="text-[10px] sm:text-[11px] uppercase tracking-wide text-[#9B2C2C]">Open conflicts</span>
          <strong className="block mt-1 text-xl sm:text-2xl font-mono text-[#9B2C2C]">{openCount}</strong>
        </div>
        <div className="bg-white border border-[#F8B4B4] rounded-md p-3 sm:p-4">
          <span className="text-[10px] sm:text-[11px] uppercase tracking-wide text-[#9B2C2C]">High severity</span>
          <strong className="block mt-1 text-xl sm:text-2xl font-mono text-[#9B2C2C]">{highSeverityCount}</strong>
        </div>
        <div className="bg-white border border-[#BCF0DA] rounded-md p-3 sm:p-4">
          <span className="text-[10px] sm:text-[11px] uppercase tracking-wide text-[#2F6B4F]">Resolved / dismissed</span>
          <strong className="block mt-1 text-xl sm:text-2xl font-mono text-[#2F6B4F]">{resolvedCount}</strong>
        </div>
      </div>

      {/* Header and Filter */}
      <div className="bg-white p-4 border border-[#E4DFD3] rounded-md shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#14213D]">Deterministic Inconsistency Auditing</h2>
          <p className="text-xs text-[#5C5E66]">
            Every conflict cites two active evidence records and derives severity from strict variance rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
          >
            <option value="ALL">All Conflicts</option>
            <option value="open">Open Inconsistencies</option>
            <option value="resolved_by_correction">Resolved by Correction</option>
            <option value="dismissed_by_human">Dismissed by Human</option>
          </select>
        </div>
      </div>

      {filteredConflicts.length === 0 ? (
        <EmptyState
          title="No conflicts detected in the uploaded evidence."
          description="All cross-document amounts, dates, and party references remain consistent."
          icon={CheckCircle2}
        />
      ) : (
        <div className="space-y-3">
          {filteredConflicts.map(c => {
            const isOpen = c.status === 'open';
            const isResolved = c.status === 'resolved_by_correction';
            const isDismissed = c.status === 'dismissed_by_human';

            return (
              <div
                key={c.id}
                className={`bg-white border rounded p-5 space-y-3 ${
                  isOpen
                    ? 'border-[#F8B4B4] bg-white card-brass-top'
                    : 'border-[#E4DFD3] bg-[#FAF7F0]/40 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-[#E4DFD3]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-[#9B2C2C] bg-[#FDF2F2] border border-[#F8B4B4] px-2 py-0.5 rounded">
                      {c.conflict_ref}
                    </span>
                    <h3 className="text-sm font-bold text-[#14213D] capitalize">
                      {c.conflict_type.replace(/_/g, ' ')}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {c.severity && (
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                          c.severity === 'High'
                            ? 'bg-[#FDF2F2] text-[#9B2C2C] border border-[#F8B4B4]'
                            : c.severity === 'Medium'
                            ? 'bg-[#FEFCE8] text-[#B7791F] border border-[#FCE96A]'
                            : 'bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]'
                        }`}
                        title={c.severity_basis || ''}
                      >
                        Severity: {c.severity}
                      </span>
                    )}

                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded uppercase font-semibold ${
                        isOpen
                          ? 'bg-[#FDF2F2] text-[#9B2C2C]'
                          : isResolved
                          ? 'bg-[#F0FDF4] text-[#2F6B4F]'
                          : 'bg-[#F1F5F9] text-[#64748B]'
                      }`}
                    >
                      {c.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {/* Evidence Comparison Grid */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-3 text-xs">
                  {/* Evidence A */}
                  <div className="p-3 bg-[#FAF7F0] border border-[#E4DFD3] rounded-md space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#14213D]">{c.evidence_a_ref}</span>
                      <button
                        onClick={() => onOpenSourceViewer(c.evidence_a_id)}
                        className="text-[#B08D57] hover:underline inline-flex items-center gap-1 font-mono text-[11px]"
                      >
                        <span>View Source</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-[11px] text-[#5C5E66]">
                      {c.evidence_a_doc} (Page {c.evidence_a_page})
                    </div>
                    <div className="font-mono font-bold text-sm text-[#14213D]">
                      {c.evidence_a_amount || c.evidence_a_date || c.evidence_a_fact}
                    </div>
                  </div>

                  {/* Evidence B */}
                  <div className="hidden md:flex flex-col items-center justify-center gap-1 text-[#9B2C2C]" aria-label="The evidence records conflict">
                    <ArrowLeftRight className="w-4 h-4" />
                    <span className="text-[9px] uppercase tracking-wide font-semibold">Mismatch</span>
                  </div>

                  <div className="p-3 bg-[#FAF7F0] border border-[#E4DFD3] rounded-md space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#14213D]">{c.evidence_b_ref}</span>
                      <button
                        onClick={() => onOpenSourceViewer(c.evidence_b_id)}
                        className="text-[#B08D57] hover:underline inline-flex items-center gap-1 font-mono text-[11px]"
                      >
                        <span>View Source</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-[11px] text-[#5C5E66]">
                      {c.evidence_b_doc} (Page {c.evidence_b_page})
                    </div>
                    <div className="font-mono font-bold text-sm text-[#14213D]">
                      {c.evidence_b_amount || c.evidence_b_date || c.evidence_b_fact}
                    </div>
                  </div>
                </div>

                {/* Why it matters & Basis */}
                <div className="p-3 bg-white border border-[#E4DFD3] rounded-md space-y-1 text-xs">
                  <span className="font-bold text-[#2B2D33] block">Why it matters:</span>
                  <p className="text-[#5C5E66]">{c.why_it_matters}</p>
                  {c.severity_basis && (
                    <div className="text-[11px] text-[#5C5E66] font-mono pt-1">
                      Basis: {c.severity_basis}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {isOpen && !isClosed && (
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => { setDismissTarget(c); setDismissError(null); }}
                      className="px-3 py-1 text-xs border border-[#E4DFD3] hover:bg-[#FAF7F0] text-[#5C5E66] rounded transition-colors"
                    >
                      Dismiss with Reason...
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dismiss Dialog Modal */}
      {dismissTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="dismiss-conflict-title" className="bg-white rounded-md border border-[#E4DFD3] shadow-2xl max-w-md w-full p-6 space-y-4 card-brass-top">
            <h3 id="dismiss-conflict-title" className="font-legal-heading text-base font-bold text-[#14213D]">
              Dismiss Conflict {dismissTarget.conflict_ref}
            </h3>
            <p className="text-xs text-[#5C5E66]">
              A written explanation is required to dismiss a detected factual conflict for legal auditing purposes.
            </p>

            <form onSubmit={handleDismiss} className="space-y-3.5 text-xs">
              {dismissError && <div role="alert" className="p-2.5 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-[#9B2C2C]">{dismissError}</div>}
              <div>
                <label className="block font-medium text-[#2B2D33] mb-1">
                  Reason for Dismissal <span className="text-[#9B2C2C]">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={dismissReason}
                  onChange={e => setDismissReason(e.target.value)}
                  placeholder="e.g., Discrepancy explained by separate oral amendment or partial advance payment credit..."
                  className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDismissTarget(null)}
                  className="px-3 py-1.5 border border-[#E4DFD3] rounded hover:bg-[#FAF7F0] text-[#5C5E66]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDismiss}
                  className="px-4 py-1.5 bg-[#14213D] text-white rounded font-medium hover:bg-[#1E2D4A] disabled:opacity-50"
                >
                  {submittingDismiss ? 'Dismissing...' : 'Confirm Dismissal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
